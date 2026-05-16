import re

with open("desktop/actions/octopus_bridge.py", "r") as f:
    content = f.read()

# Fix the redundant code block left over in _get_or_create_project
content = re.sub(
    r"    return f\"octopus-session-{int\(time\.time\(\)\)}\"\n    try:.*?    return PROJECT_ID\n",
    r'''    return f"octopus-session-{int(time.time())}"\n''',
    content,
    flags=re.DOTALL
)

with open("desktop/actions/octopus_bridge.py", "w") as f:
    f.write(content)
