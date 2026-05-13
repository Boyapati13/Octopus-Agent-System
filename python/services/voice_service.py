"""
Octopus Voice Service — Gemini Live Audio Bridge
=================================================
Sits between the browser frontend and the Gemini Live API.
Routes Gemini tool-calls to the Octopus Node.js agent API.

Architecture:
  Browser (voice.js)
    ↕ WebSocket  ws://localhost:8765
  voice_service.py
    ↕ Gemini Live (audio streaming + tool-calls)
    ↕ HTTP → localhost:3001  (Octopus Node API → 14 agents / 23 MCP tools)

Start:
  python python/services/voice_service.py
  # or:  GEMINI_API_KEY=... python python/services/voice_service.py

Environment:
  GEMINI_API_KEY   – required (or stored in config/api_keys.json)
  OCTOPUS_API      – Octopus Node API base URL  (default: http://localhost:3001)
  VOICE_WS_PORT    – WebSocket port              (default: 8765)
  VOICE_MODEL      – Gemini model string         (default: gemini-2.0-flash-live-001)
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import sys
import traceback
from pathlib import Path

import aiohttp
import websockets
from google import genai
from google.genai import types

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="[Voice] %(levelname)s  %(message)s",
)
log = logging.getLogger("voice")

# ── Config ────────────────────────────────────────────────────────────────────

BASE_DIR         = Path(__file__).resolve().parent.parent.parent
API_CONFIG_PATH  = BASE_DIR / "config" / "api_keys.json"

OCTOPUS_API      = os.getenv("OCTOPUS_API",   "http://localhost:3001")
WS_PORT          = int(os.getenv("VOICE_WS_PORT", "8765"))
LIVE_MODEL       = os.getenv("VOICE_MODEL",   "gemini-2.0-flash-live-001")

SEND_SAMPLE_RATE    = 16_000   # mic PCM  → Gemini
RECEIVE_SAMPLE_RATE = 24_000   # Gemini audio → browser


def _get_api_key() -> str:
    key = os.getenv("GEMINI_API_KEY", "")
    if key:
        return key
    try:
        with open(API_CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f).get("gemini_api_key", "")
    except Exception:
        pass
    raise RuntimeError(
        "No Gemini API key found. Set GEMINI_API_KEY env var or add it to "
        "config/api_keys.json as {\"gemini_api_key\": \"YOUR_KEY\"}"
    )


# ── Octopus agent tool-call bridge ────────────────────────────────────────────

OCTOPUS_TOOLS: list[dict] = [
    {
        "name": "run_task",
        "description": (
            "Send a task to the Octopus multi-agent system. "
            "Cortex will route it to the best specialist agent (Atlas, Architect, Forge, "
            "Reviewer, SecurityReviewer, Probe, Scribe, ReleaseKeeper, etc.). "
            "Use for: coding tasks, analysis, planning, reviews, memory queries, "
            "file indexing, and any software-engineering workflow."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "task": {
                    "type": "STRING",
                    "description": "Full description of what the agent should accomplish."
                },
                "agent": {
                    "type": "STRING",
                    "description": (
                        "Optional: force a specific agent. "
                        "Values: cortex | atlas | architect | forge | reviewer | "
                        "securityreviewer | probe | scribe | releasekeeper | "
                        "navigator | factchecker | marketscout | toolsmith | sandboxqa"
                    )
                },
            },
            "required": ["task"],
        },
    },
    {
        "name": "list_agents",
        "description": "List all Octopus agents with their roles and capabilities.",
        "parameters": {"type": "OBJECT", "properties": {}, "required": []},
    },
    {
        "name": "get_memory_context",
        "description": (
            "Retrieve the current Octopus run-state memory: active task, "
            "changed files, blockers, and recent decisions."
        ),
        "parameters": {"type": "OBJECT", "properties": {}, "required": []},
    },
    {
        "name": "search_memory",
        "description": (
            "Search the Octopus structural memory (L1 graph) for files, "
            "symbols, or architectural facts about the codebase."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": "File path fragment, symbol name, or concept to search for."
                },
                "limit": {
                    "type": "INTEGER",
                    "description": "Max results to return (default 10)."
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_decisions",
        "description": "Retrieve recorded architectural decisions (ADRs) from Octopus memory L2.",
        "parameters": {"type": "OBJECT", "properties": {}, "required": []},
    },
]

SYSTEM_PROMPT = """\
You are Octopus, an advanced AI software-engineering assistant.
You have access to a team of 14 specialist AI agents:
  Cortex (router), Atlas (knowledge), Architect (design), Forge (code),
  Reviewer (QA), SecurityReviewer (security), Probe (testing),
  Scribe (docs), ReleaseKeeper (releases), Navigator (browser),
  FactChecker (verification), MarketScout (market), Toolsmith (tools),
  SandboxQA (parallel QA).

Always use the provided tools to fulfill requests. Be concise and precise.
When a user asks you to write, fix, review, or analyse code — call run_task.
Never simulate results — always call the tool and report what Octopus returned.
"""


async def call_octopus(session: aiohttp.ClientSession, name: str, args: dict) -> str:
    """Forward a Gemini tool-call to the Octopus Node.js API."""
    try:
        if name == "run_task":
            agent = args.get("agent", "").lower().strip()
            task  = args.get("task", "")
            if agent and agent not in ("cortex", ""):
                url  = f"{OCTOPUS_API}/api/agent/{agent}/run"
                body = {"task": task, "query": task}
            else:
                url  = f"{OCTOPUS_API}/api/run"
                body = {"task": task, "query": task}
            async with session.post(url, json=body, timeout=aiohttp.ClientTimeout(total=60)) as r:
                data = await r.json()
                # Pull the most meaningful text field out of the response
                result = (
                    data.get("result") or
                    data.get("output") or
                    data.get("advice") or
                    data.get("summary") or
                    json.dumps(data, indent=2)[:800]
                )
                return str(result)

        elif name == "list_agents":
            async with session.get(f"{OCTOPUS_API}/api/agents") as r:
                agents = await r.json()
                lines  = [f"• {a['name']} ({a['role']})" for a in agents]
                return "Available Octopus agents:\n" + "\n".join(lines)

        elif name == "get_memory_context":
            async with session.get(f"{OCTOPUS_API}/api/memory/run") as r:
                data = await r.json()
                return json.dumps(data, indent=2)[:1000]

        elif name == "search_memory":
            limit = args.get("limit", 10)
            query = args.get("query", "")
            url   = f"{OCTOPUS_API}/api/memory/structural?limit={limit}&q={query}"
            async with session.get(url) as r:
                data = await r.json()
                return json.dumps(data, indent=2)[:1000]

        elif name == "get_decisions":
            async with session.get(f"{OCTOPUS_API}/api/memory/decisions") as r:
                data = await r.json()
                return json.dumps(data, indent=2)[:1000]

        else:
            return f"Unknown tool: {name}"

    except aiohttp.ClientConnectorError:
        return (
            "Octopus API is offline. Start the Node.js server with: "
            "cd node && node src/server.js"
        )
    except Exception as exc:
        log.error("Octopus call failed: %s", exc)
        return f"Error calling Octopus: {exc}"


# ── WebSocket session handler ─────────────────────────────────────────────────

def _build_live_config() -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        output_audio_transcription={},
        input_audio_transcription={},
        system_instruction=SYSTEM_PROMPT,
        tools=[{"function_declarations": OCTOPUS_TOOLS}],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon")
            )
        ),
    )


async def handle_browser_client(ws: websockets.WebSocketServerProtocol) -> None:
    """Manage one browser ↔ Gemini Live ↔ Octopus session."""
    peer = ws.remote_address
    log.info("Client connected: %s", peer)

    api_key = _get_api_key()
    client  = genai.Client(api_key=api_key, http_options={"api_version": "v1beta"})

    async def send(msg: dict) -> None:
        try:
            await ws.send(json.dumps(msg))
        except Exception:
            pass

    await send({"type": "connected", "model": LIVE_MODEL})

    async with aiohttp.ClientSession() as http_session:
        while True:
            try:
                await send({"type": "state", "state": "THINKING"})
                log.info("Connecting to Gemini Live…")

                async with client.aio.live.connect(
                    model=LIVE_MODEL,
                    config=_build_live_config(),
                ) as gemini_session:

                    log.info("Gemini Live connected.")
                    await send({"type": "state", "state": "LISTENING"})

                    in_buf:  list[str] = []
                    out_buf: list[str] = []

                    async def recv_from_browser() -> None:
                        """Forward browser messages → Gemini."""
                        async for raw in ws:
                            try:
                                msg = json.loads(raw)
                            except Exception:
                                continue

                            mtype = msg.get("type")

                            if mtype == "audio":
                                pcm = base64.b64decode(msg["data"])
                                await gemini_session.send_realtime_input(
                                    media={"data": pcm, "mime_type": "audio/pcm"}
                                )

                            elif mtype == "text":
                                text = msg.get("data", "").strip()
                                if text:
                                    await gemini_session.send_client_content(
                                        turns={"parts": [{"text": text}]},
                                        turn_complete=True,
                                    )

                            elif mtype == "ping":
                                await send({"type": "pong"})

                    async def recv_from_gemini() -> None:
                        """Forward Gemini responses → browser."""
                        nonlocal in_buf, out_buf

                        async for response in gemini_session.receive():

                            # ── Audio chunk ──
                            if response.data:
                                await send({
                                    "type": "audio",
                                    "data": base64.b64encode(response.data).decode(),
                                    "sample_rate": RECEIVE_SAMPLE_RATE,
                                })

                            # ── Server content (transcripts + turn_complete) ──
                            if response.server_content:
                                sc = response.server_content

                                if sc.output_transcription and sc.output_transcription.text:
                                    txt = sc.output_transcription.text.strip()
                                    if txt:
                                        out_buf.append(txt)
                                        await send({"type": "state", "state": "SPEAKING"})

                                if sc.input_transcription and sc.input_transcription.text:
                                    txt = sc.input_transcription.text.strip()
                                    if txt:
                                        in_buf.append(txt)

                                if sc.turn_complete:
                                    full_in  = " ".join(in_buf).strip()
                                    full_out = " ".join(out_buf).strip()
                                    if full_in:
                                        await send({"type": "transcript_in",  "text": full_in})
                                    if full_out:
                                        await send({"type": "transcript_out", "text": full_out})
                                    in_buf  = []
                                    out_buf = []
                                    await send({"type": "state", "state": "LISTENING"})

                            # ── Tool calls ──
                            if response.tool_call:
                                await send({"type": "state", "state": "THINKING"})
                                fn_responses = []

                                for fc in response.tool_call.function_calls:
                                    name = fc.name
                                    args = dict(fc.args or {})
                                    log.info("Tool call: %s  %s", name, args)
                                    await send({"type": "tool_call", "name": name, "args": args})

                                    result = await call_octopus(http_session, name, args)
                                    log.info("Tool result: %s → %s", name, result[:80])
                                    await send({"type": "tool_result", "name": name, "result": result})

                                    fn_responses.append(
                                        types.FunctionResponse(
                                            id=fc.id, name=name,
                                            response={"result": result},
                                        )
                                    )

                                await gemini_session.send_tool_response(
                                    function_responses=fn_responses
                                )
                                await send({"type": "state", "state": "LISTENING"})

                    # Run browser-receiver and Gemini-receiver concurrently
                    try:
                        await asyncio.gather(
                            recv_from_browser(),
                            recv_from_gemini(),
                        )
                    except websockets.exceptions.ConnectionClosed:
                        log.info("Browser disconnected: %s", peer)
                        return
                    except Exception as exc:
                        log.warning("Session error: %s — reconnecting…", exc)
                        traceback.print_exc()

            except Exception as exc:
                log.error("Gemini connect error: %s", exc)
                await send({"type": "error", "message": str(exc)})

            await send({"type": "state", "state": "THINKING"})
            log.info("Reconnecting to Gemini in 3 s…")
            await asyncio.sleep(3)


# ── Entry point ───────────────────────────────────────────────────────────────

async def main() -> None:
    try:
        api_key = _get_api_key()
        log.info("API key loaded from configuration")
    except RuntimeError as e:
        log.error("%s", e)
        sys.exit(1)

    log.info("Octopus Voice Service starting on ws://localhost:%d", WS_PORT)
    log.info("Gemini model: %s", LIVE_MODEL)
    log.info("Octopus API:  %s", OCTOPUS_API)

    async with websockets.serve(
        handle_browser_client,
        "localhost",
        WS_PORT,
        max_size=10 * 1024 * 1024,  # 10 MB max message
        ping_interval=20,
        ping_timeout=40,
    ):
        log.info("✅ Voice Service ready — open the Octopus frontend and click the Voice tab.")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Shutdown.")
