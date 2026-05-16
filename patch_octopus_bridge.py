import re

with open("desktop/actions/octopus_bridge.py", "r") as f:
    content = f.read()

# Fix PROJECT_ID global state leak and exception swallowing
new_content = re.sub(
    r"PROJECT_ID\s*=\s*None\s*# auto-assigned per session\n\n\ndef _get_or_create_project\(\) -> str:.*?return PROJECT_ID\n\n",
    r'''def _get_or_create_project() -> str:
    """Use or create the active Octopus project."""
    try:
        r = requests.get(f"{OCTOPUS_BASE}/api/status", timeout=5)
        data = r.json()
        pid = data.get("active_project_id")
        if pid:
            return pid
    except requests.RequestException:
        pass
    return f"octopus-session-{int(time.time())}"

''',
    content,
    flags=re.DOTALL
)

new_content = re.sub(
    r"def _stream_events\(project_id: str, log: Optional\[Callable\], stop_event: threading\.Event\):(.*?)        except Exception:\n            pass\n        time\.sleep\(POLL_INTERVAL\)",
    r'''def _stream_events(project_id: str, log: Optional[Callable], stop_event: threading.Event):
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
        time.sleep(POLL_INTERVAL)''',
    new_content,
    flags=re.DOTALL
)

new_content = new_content.replace(
    "Direct tool dispatch entry point for Mark-XXXIX tool system.",
    "Direct tool dispatch entry point for Octopus Agent System."
)
new_content = new_content.replace(
    "This bridge sends tasks to it via HTTP and streams results back to the Mark-XXXIX UI.",
    "This bridge sends tasks to it via HTTP and streams results back to the Octopus UI."
)

with open("desktop/actions/octopus_bridge.py", "w") as f:
    f.write(new_content)
