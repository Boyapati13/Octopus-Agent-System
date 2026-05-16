import os

for path in ["desktop/core/text_llm.py", "desktop/core/core/text_llm.py"]:
    if not os.path.exists(path):
        continue
    with open(path, "r") as f:
        content = f.read()

    # Unify API headers
    content = content.replace('"HTTP-Referer": "https://mark-xxxix.local",', '"HTTP-Referer": "https://octopus-agent.local",')
    content = content.replace('"X-Title": "Mark-XXXIX",', '"X-Title": "Octopus Agent System",')

    # General Branding Fix
    content = content.replace("Multi-provider text LLM adapter for Mark-XXXIX", "Multi-provider text LLM adapter for Octopus")

    with open(path, "w") as f:
        f.write(content)
