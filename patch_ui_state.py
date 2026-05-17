import re

with open("desktop/main.py", "r") as f:
    content = f.read()

# Update tool execution to set state to PROCESSING
content = content.replace('self.ui.set_state("THINKING")', 'self.ui.set_state("PROCESSING")')

with open("desktop/main.py", "w") as f:
    f.write(content)
