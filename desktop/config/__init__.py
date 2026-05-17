from __future__ import annotations

import platform


def get_os() -> str:
    return platform.system().lower()


def is_windows() -> bool:
    return get_os() == "windows"


def is_mac() -> bool:
    return get_os() == "darwin"


def is_linux() -> bool:
    return get_os() == "linux"
