"""
terminal.py — Full Windows terminal execution for OCTO.

Supports: PowerShell, CMD, Bash (Git Bash / WSL), Python inline.
Returns stdout + stderr + exit code.
Working directory, timeout, and environment variable support included.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional


# ── Safety guard ───────────────────────────────────────────────────────────────
_SAFE_MODE = os.environ.get("SAFE_MODE", "false").lower() == "true"

# Commands that are destructive — require SAFE_MODE=false to run
_DANGER_PATTERNS = [
    "rm -rf /", "format c:", "del /f /s /q c:\\",
    "rmdir /s /q c:\\", ":(){:|:&};:", "mkfs.",
    "dd if=/dev/zero", "shutdown /r /t 0 /f",
]


def _is_dangerous(cmd: str) -> bool:
    low = cmd.lower()
    return any(p in low for p in _DANGER_PATTERNS)


# ── Shell resolvers ────────────────────────────────────────────────────────────
def _find_powershell() -> str:
    """Prefer pwsh (PowerShell 7) over Windows PowerShell 5."""
    for candidate in ("pwsh", "pwsh.exe", "powershell", "powershell.exe"):
        try:
            r = subprocess.run(
                [candidate, "-NoProfile", "-Command", "echo ok"],
                capture_output=True, timeout=5
            )
            if r.returncode == 0:
                return candidate
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return "powershell"


def _find_bash() -> Optional[str]:
    """Find Git Bash or WSL bash on Windows."""
    candidates = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
        "bash",      # WSL bash if on PATH
        "bash.exe",
    ]
    for c in candidates:
        try:
            r = subprocess.run([c, "--version"], capture_output=True, timeout=3)
            if r.returncode == 0:
                return c
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return None


# ── Core runner ────────────────────────────────────────────────────────────────
def run_command(
    command: str,
    shell_type: str = "powershell",
    cwd: Optional[str] = None,
    timeout: int = 30,
    env: Optional[dict] = None,
) -> dict:
    """
    Execute a command in the chosen shell. Returns:
      {"stdout": str, "stderr": str, "returncode": int, "success": bool, "shell": str}
    """
    if _is_dangerous(command):
        return {
            "stdout": "", "stderr": "BLOCKED: Command contains a dangerous pattern.",
            "returncode": -1, "success": False, "shell": shell_type
        }

    work_dir = str(Path(cwd).resolve()) if cwd and Path(cwd).exists() else str(Path.home())
    merged_env = {**os.environ, **(env or {})}

    shell_type = shell_type.lower()

    try:
        if shell_type in ("powershell", "ps", "pwsh"):
            ps = _find_powershell()
            proc = subprocess.run(
                [ps, "-NoProfile", "-NonInteractive", "-Command", command],
                capture_output=True, text=True, timeout=timeout,
                cwd=work_dir, env=merged_env,
                encoding="utf-8", errors="replace",
            )

        elif shell_type in ("cmd", "bat", "batch"):
            proc = subprocess.run(
                ["cmd", "/c", command],
                capture_output=True, text=True, timeout=timeout,
                cwd=work_dir, env=merged_env,
                encoding="utf-8", errors="replace",
            )

        elif shell_type in ("bash", "sh", "git-bash"):
            bash = _find_bash()
            if not bash:
                return {
                    "stdout": "", "stderr": "Bash not found. Install Git for Windows or WSL.",
                    "returncode": -1, "success": False, "shell": "bash"
                }
            proc = subprocess.run(
                [bash, "-c", command],
                capture_output=True, text=True, timeout=timeout,
                cwd=work_dir, env=merged_env,
                encoding="utf-8", errors="replace",
            )

        elif shell_type in ("python", "py"):
            proc = subprocess.run(
                [sys.executable, "-c", command],
                capture_output=True, text=True, timeout=timeout,
                cwd=work_dir, env=merged_env,
                encoding="utf-8", errors="replace",
            )

        else:
            # Generic: pass directly to subprocess
            proc = subprocess.run(
                command, shell=True,
                capture_output=True, text=True, timeout=timeout,
                cwd=work_dir, env=merged_env,
                encoding="utf-8", errors="replace",
            )

        return {
            "stdout":     proc.stdout.strip(),
            "stderr":     proc.stderr.strip(),
            "returncode": proc.returncode,
            "success":    proc.returncode == 0,
            "shell":      shell_type,
        }

    except subprocess.TimeoutExpired:
        return {
            "stdout": "", "stderr": f"Command timed out after {timeout}s",
            "returncode": -1, "success": False, "shell": shell_type
        }
    except Exception as e:
        return {
            "stdout": "", "stderr": str(e),
            "returncode": -1, "success": False, "shell": shell_type
        }


def _format_result(result: dict) -> str:
    parts = []
    if result["stdout"]:
        parts.append(result["stdout"])
    if result["stderr"] and not result["success"]:
        parts.append(f"[STDERR] {result['stderr']}")
    if not result["success"]:
        parts.append(f"[Exit code: {result['returncode']}]")
    return "\n".join(parts) if parts else "Command completed with no output."


# ── Tool entry point ───────────────────────────────────────────────────────────
def run_terminal(parameters: dict, player=None, speak=None, **_) -> str:
    """
    OCTO tool entry point.
    parameters:
      command    : str  — the command to run
      shell      : str  — powershell | cmd | bash | python (default: powershell)
      cwd        : str  — working directory (default: user home)
      timeout    : int  — seconds (default: 30)
    """
    command = parameters.get("command", "").strip()
    if not command:
        return "No command provided."

    shell   = parameters.get("shell", parameters.get("shell_type", "powershell"))
    cwd     = parameters.get("cwd", "")
    timeout = int(parameters.get("timeout", 30))

    if player:
        player.write_log(f"[TERMINAL:{shell.upper()}] {command[:80]}")

    result = run_command(command, shell_type=shell, cwd=cwd or None, timeout=timeout)
    output = _format_result(result)

    if player:
        preview = output[:120].replace("\n", " ")
        player.write_log(f"[OUTPUT] {preview}")

    return output
