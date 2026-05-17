"""
octo_desktop.py — OCTO Desktop Launcher
========================================
Launches the native PyQt6 HUD (Mark-XXXIX engine, OCTO branding).

Voice modes (auto-detected):
  1. Gemini native audio  — if gemini_api_key is set in config/api_keys.json
  2. Free local voice     — Windows TTS (pyttsx3) + Google free STT (no key needed)

Octopus server starts in background automatically.

Run:  py octo_desktop.py
"""

import asyncio
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

# ── Add desktop/ to path so imports resolve ───────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

OCTOPUS_NODE_DIR = BASE_DIR.parent / "node"
SERVER_ENTRY     = OCTOPUS_NODE_DIR / "src" / "server.js"
API_CONFIG_PATH  = BASE_DIR / "config" / "api_keys.json"
FACE_IMG         = BASE_DIR / "face.png"
DASHBOARD_URL    = "http://localhost:3001"


# ── Config ────────────────────────────────────────────────────────────────────
def _load_config() -> dict:
    try:
        return json.loads(API_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _gemini_key() -> str:
    cfg = _load_config()
    k = cfg.get("gemini_api_key", "")
    return k if k and "YOUR" not in k else ""


# ── Octopus server ─────────────────────────────────────────────────────────────
_server_proc = None


def _octopus_running() -> bool:
    try:
        import requests
        return requests.get(f"{DASHBOARD_URL}/api/health", timeout=2).status_code == 200
    except Exception:
        return False


def _start_server_background():
    global _server_proc
    if _octopus_running():
        print("[OCTO] Server already running")
        return
    if not SERVER_ENTRY.exists():
        print(f"[OCTO] Server not found at {SERVER_ENTRY}")
        return
    print("[OCTO] Starting Octopus server...")
    try:
        _server_proc = subprocess.Popen(
            ["node", str(SERVER_ENTRY)],
            cwd=str(OCTOPUS_NODE_DIR),
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        for _ in range(20):
            time.sleep(0.5)
            if _octopus_running():
                print("[OCTO] Server online")
                return
    except Exception as e:
        print(f"[OCTO] Could not start server: {e}")


# ── Voice backend selection ───────────────────────────────────────────────────
def _start_voice(ui):
    """Auto-detect voice mode and start the backend."""
    key = _gemini_key()

    if key:
        # ── Mode A: Gemini native audio ────────────────────────────────────
        print("[OCTO] Voice: Gemini native audio")
        ui.write_log("SYS: Voice mode — Gemini live audio")

        def _run_gemini():
            from main import OctoLive
            octo = OctoLive(ui)
            asyncio.run(octo.run())

        threading.Thread(target=_run_gemini, daemon=True).start()

    else:
        # ── Mode B: Free local voice (push-to-talk, no key needed) ────────
        print("[OCTO] Voice: free backend (pyttsx3 + Google STT, push-to-talk)")
        ui.write_log("SYS: Voice mode — Windows TTS + Google STT")

        try:
            from core.voice_free import FreeVoiceBackend
            from actions.octopus_bridge import octopus_run_tool

            backend = FreeVoiceBackend(ui=ui, execute_tool_fn=octopus_run_tool)
            backend.start()

            # ── Wire typed command box → Octopus server + TTS ─────────────
            def _on_typed(text: str):
                def _run():
                    ui.write_log(f"You: {text}")
                    answer = backend._ask_server(text)
                    if answer:
                        backend.speak(answer)
                threading.Thread(target=_run, daemon=True).start()

            ui.on_text_command = _on_typed
            print("[OCTO] Text command box wired to Octopus server")

            # ── Wire PUSH TO TALK button → trigger_listen() ────────────────
            try:
                win = ui._win
                ptt_btn = getattr(win, '_ptt_btn', None)
                if ptt_btn and hasattr(ptt_btn, 'clicked'):
                    from PyQt6.QtCore import QTimer as _QT

                    def _on_ptt():
                        if getattr(win, '_muted', False):
                            return
                        ptt_btn.setText("🔴  RECORDING…")
                        ptt_btn.setEnabled(False)
                        backend.trigger_listen()
                        # Re-enable on main thread after recording + answer (~9s)
                        _QT.singleShot(9000, lambda: (
                            ptt_btn.setText("🎤  PUSH TO TALK"),
                            ptt_btn.setEnabled(True),
                        ))

                    ptt_btn.clicked.connect(_on_ptt)
                    print("[OCTO] Push-to-talk button wired — click to record")
                else:
                    print("[OCTO] PTT button not found — trigger_listen still works via code")
            except Exception as hook_err:
                print(f"[OCTO] PTT button hook failed: {hook_err}")

        except Exception as e:
            print(f"[OCTO] Free voice error: {e}")
            import traceback; traceback.print_exc()
            ui.write_log(f"SYS: Voice error — {e}")


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    # Start Octopus server in background (non-blocking)
    threading.Thread(target=_start_server_background, daemon=True).start()

    from ui import OctoUI
    from PyQt6.QtCore import QTimer

    face = str(FACE_IMG) if FACE_IMG.exists() else ""
    ui = OctoUI(face)

    # Wire voice AFTER Qt event loop starts — QTimer.singleShot runs on the
    # main thread so signal connections are safe. Threading.Timer runs on a
    # background thread and Qt silently drops connections made there.
    QTimer.singleShot(800, lambda: _start_voice(ui))

    ui.root.mainloop()


if __name__ == "__main__":
    main()
