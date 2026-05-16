import re

with open("desktop/actions/octopus_bridge.py", "r") as f:
    content = f.read()

# Completely remove PROJECT_ID global
content = re.sub(r"PROJECT_ID\s*=\s*None\s*# auto-assigned per session\n", "", content)

# Fix _get_or_create_project replacement logic which failed in the first patch
content = re.sub(
    r"def _get_or_create_project\(\) -> str:.*?    return PROJECT_ID\n",
    r'''def _get_or_create_project() -> str:
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
''',
    content,
    flags=re.DOTALL
)

with open("desktop/actions/octopus_bridge.py", "w") as f:
    f.write(content)
