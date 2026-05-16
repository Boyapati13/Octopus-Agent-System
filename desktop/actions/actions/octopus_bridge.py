"""
octopus_bridge.py — Routes complex coding/review tasks to the Octopus multi-agent pipeline.

The Octopus server (Node.js, port 3001) runs:
  - Cortex planner  → Atlas memory → Architect → Forge → Reviewer → SecurityReviewer
  - Probe (tests) → FactChecker → Scribe → ReleaseKeeper

This bridge sends tasks to it via HTTP and streams results back to the Octopus UI.

Usage (called by dev_agent, code_helper, or directly from main.py tool dispatch):
  result = octopus_run(task, project_root=None, speak=None, log=None)
"""

from __future__ import annotations

import time
import json
import threading
from typing import Callable, Optional

import requests

OCTOPUS_BASE    = "http://localhost:3001"
DEFAULT_TIMEOUT = 300   # 5 min max for full pipeline
POLL_INTERVAL   = 2     # seconds between status polls


def _octopus_available() -> bool:
    try:
        r = requests.get(f"{OCTOPUS_BASE}/api/health", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def _get_or_create_project() -> str:
    """Use or create the active Octopus project."""
    try:
        r = requests.get(f"{OCTOPUS_BASE}/api/status", timeout=5)
        r.raise_for_status()
        data = r.json()
        pid = data.get("active_project_id")
        if pid:
            return pid
    except requests.RequestException:
        pass
    return f"octopus-session-{int(time.time())}"


def _stream_events(project_id: str, log: Optional[Callable], stop_event: threading.Event):
    """Poll /api/status until the chain completes, calling log() with progress."""
    start = time.time()
    last_answer = ""
    while not stop_event.is_set():
        if time.time() - start > DEFAULT_TIMEOUT:
            if log:
                log("[Octopus] Task timed out.")
            break
        try:
            r = requests.get(f"{OCTOPUS_BASE}/api/status", timeout=5)
            r.raise_for_status()
            data = r.json()
            projects = data.get("projects") or []
            project = next((p for p in projects if p["id"] == project_id), None)
            if not project:
                break

            answer = project.get("answer", "")
            status = project.get("answer_status", "running")

            # Log new answer text as it arrives
            if answer and answer != last_answer and answer not in ("Working…", "Processing…"):
                last_answer = answer
                if log:
                    log(f"[Octopus] {answer[:200]}")

            if status in ("done", "failed"):
                break
        except requests.RequestException as e:
            if log:
                log(f"[Octopus] Connection error during polling: {e}")
            break
        time.sleep(POLL_INTERVAL)


def octopus_run(
    task: str,
    project_root: Optional[str] = None,
    speak: Optional[Callable] = None,
    log: Optional[Callable] = None,
    use_ask: bool = False,
) -> str:
    """
    Send a task to the Octopus multi-agent pipeline.

    Args:
        task:         The task / instruction string
        project_root: Optional path to the codebase Octopus should work on
        speak:        Optional TTS callback (called with status updates)
        log:          Optional UI log callback (called with progress lines)
        use_ask:      If True, use /api/tasks/ask (fast Q&A) instead of full pipeline

    Returns:
        The final answer string from the pipeline
    """
    if not _octopus_available():
        return (
            "Octopus pipeline is not running. "
            "Start it with: node C:\\Users\\Tenders\\Downloads\\octopus-software-full\\node\\src\\server.js"
        )

    project_id = _get_or_create_project()

    if log:
        log(f"[Octopus] Starting {'Q&A' if use_ask else 'agent pipeline'} for: {task[:80]}")
    if speak:
        speak("Routing to the Octopus agent pipeline, sir.")

    endpoint = "/api/tasks/ask" if use_ask else "/api/tasks/run"
    payload  = {"text": task, "project_id": project_id} if use_ask else {"task": task, "project_id": project_id}

    # Fire the task
    try:
        r = requests.post(f"{OCTOPUS_BASE}{endpoint}", json=payload, timeout=10)
        r.raise_for_status()
    except Exception as e:
        return f"Failed to start Octopus task: {e}"

    # Stream progress in a background thread
    stop_evt = threading.Event()
    t = threading.Thread(target=_stream_events, args=(project_id, log, stop_evt), daemon=True)
    t.start()
    t.join(timeout=DEFAULT_TIMEOUT + 5)
    stop_evt.set()

    # Fetch final answer
    try:
        r = requests.get(f"{OCTOPUS_BASE}/api/projects/{project_id}", timeout=5)
        data = r.json()
        answer = data.get("answer", "")
        if answer and answer not in ("Working…", "Processing…", "Task interrupted."):
            return answer
    except Exception:
        pass

    # Fallback: get from status
    try:
        r = requests.get(f"{OCTOPUS_BASE}/api/status", timeout=5)
        projects = r.json().get("projects") or []
        project = next((p for p in projects if p["id"] == project_id), None)
        if project:
            return project.get("answer", "Pipeline completed.")
    except Exception:
        pass

    return "Octopus pipeline completed."


def octopus_run_tool(parameters: dict, speak=None, player=None, **_) -> str:
    """
    Direct tool dispatch entry point for Octopus Agent System.
    Called when Gemini requests the 'octopus_agent' tool.
    """
    task         = parameters.get("task", "").strip()
    project_root = parameters.get("project_root", "")
    use_ask      = parameters.get("quick", False)

    if not task:
        return "Please provide a task for the Octopus pipeline."

    log_fn = player.write_log if player else None

    return octopus_run(
        task=task,
        project_root=project_root or None,
        speak=speak,
        log=log_fn,
        use_ask=use_ask,
    )
