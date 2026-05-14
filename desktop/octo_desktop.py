"""
octo_desktop.py — OCTO Desktop Launcher

Embeds the Octopus web dashboard (localhost:3001) in a native PyQt6 window.
Also starts the Octopus Node.js server automatically if it's not running,
and runs the voice/tool backend (OctoLive from main.py) in the background.

Run with:  py octo_desktop.py
"""

import asyncio
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from PyQt6.QtCore import QTimer, QUrl, Qt, QSize
from PyQt6.QtGui import QIcon, QKeySequence, QShortcut
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings, QWebEnginePage, QWebEngineScript
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout,
    QHBoxLayout, QPushButton, QLabel, QStatusBar, QSizePolicy,
)

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).resolve().parent
OCTOPUS_DIR  = BASE_DIR.parent / "octopus-software-full" / "node"
SERVER_ENTRY = OCTOPUS_DIR / "src" / "server.js"
DASHBOARD_URL = "http://localhost:3001"
API_CONFIG_PATH = BASE_DIR / "config" / "api_keys.json"


# ── Server management ──────────────────────────────────────────────────────────
_server_proc = None

def _octopus_running() -> bool:
    try:
        import requests
        r = requests.get(f"{DASHBOARD_URL}/api/health", timeout=2)
        return r.status_code == 200
    except Exception:
        return False

def _start_octopus_server():
    global _server_proc
    if _octopus_running():
        print("[OctoDesktop] Octopus server already running")
        return
    print("[OctoDesktop] Starting Octopus server...")
    try:
        _server_proc = subprocess.Popen(
            ["node", str(SERVER_ENTRY)],
            cwd=str(OCTOPUS_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        # Wait up to 8 seconds for server to come up
        for _ in range(16):
            time.sleep(0.5)
            if _octopus_running():
                print("[OctoDesktop] Octopus server online")
                return
        print("[OctoDesktop] ⚠ Server may still be starting...")
    except Exception as e:
        print(f"[OctoDesktop] Could not start server: {e}")


# ── Voice backend ──────────────────────────────────────────────────────────────
def _start_voice_backend(status_label: QLabel):
    """Run OctoLive (Gemini voice + desktop tools) in a daemon thread."""
    def _api_key_available() -> bool:
        try:
            cfg = json.loads(API_CONFIG_PATH.read_text(encoding="utf-8"))
            key = cfg.get("gemini_api_key", "")
            return bool(key and key not in ("YOUR_GEMINI_API_KEY_HERE", ""))
        except Exception:
            return False

    def _run():
        if not _api_key_available():
            status_label.setText("Voice: No Gemini key — add to config/api_keys.json")
            return

        try:
            sys.path.insert(0, str(BASE_DIR))
            # Lazy import — ui module would create a second QApplication if imported at top level
            from main import OctoLive

            class _HeadlessUI:
                """Minimal UI shim that logs to the Octopus dashboard instead of PyQt."""
                muted = False
                on_text_command = None
                current_file = None

                def set_state(self, state): pass
                def write_log(self, text):
                    try:
                        import requests
                        cfg = json.loads(API_CONFIG_PATH.read_text())
                        pid = "octo-desktop"
                        requests.post(
                            f"{DASHBOARD_URL}/api/tasks/ask",
                            json={"text": f"[OCTO Voice] {text}", "project_id": pid},
                            timeout=2,
                        )
                    except Exception:
                        print(f"[OctoLive] {text}")
                def wait_for_api_key(self): pass
                def start_speaking(self): pass
                def stop_speaking(self): pass

            status_label.setText("Voice: OCTO online (Gemini audio active)")
            ui_shim = _HeadlessUI()
            octo = OctoLive(ui_shim)
            asyncio.run(octo.run())
        except Exception as e:
            status_label.setText(f"Voice: {str(e)[:60]}")
            print(f"[OctoDesktop] Voice backend error: {e}")

    threading.Thread(target=_run, daemon=True).start()


# ── Toolbar ────────────────────────────────────────────────────────────────────
def _make_btn(text: str, color: str = "#00d4ff", tooltip: str = "") -> QPushButton:
    btn = QPushButton(text)
    btn.setToolTip(tooltip)
    btn.setFixedHeight(28)
    btn.setCursor(Qt.CursorShape.PointingHandCursor)
    btn.setStyleSheet(f"""
        QPushButton {{
            background: transparent;
            color: {color};
            border: 1px solid {color}55;
            border-radius: 4px;
            padding: 0 10px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            letter-spacing: 1px;
        }}
        QPushButton:hover {{
            background: {color}22;
            border-color: {color};
        }}
        QPushButton:pressed {{
            background: {color}44;
        }}
    """)
    return btn


# ── Main window ────────────────────────────────────────────────────────────────
class OctoDesktopWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("OCTO — Autonomous Agent System")
        self.resize(1400, 860)
        self.setMinimumSize(QSize(900, 600))
        self._apply_dark_frame()
        self._build_ui()

    def _apply_dark_frame(self):
        self.setStyleSheet("""
            QMainWindow {
                background: #00060a;
            }
            QStatusBar {
                background: #010d14;
                color: #3a8a9a;
                font-family: 'Courier New', monospace;
                font-size: 10px;
                border-top: 1px solid #0d3347;
            }
            QLabel#title {
                color: #00d4ff;
                font-family: 'Courier New', monospace;
                font-size: 13px;
                font-weight: bold;
                letter-spacing: 3px;
            }
            QLabel#subtitle {
                color: #3a8a9a;
                font-family: 'Courier New', monospace;
                font-size: 9px;
                letter-spacing: 2px;
            }
            QWidget#toolbar {
                background: #010d14;
                border-bottom: 1px solid #0d3347;
            }
        """)

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # ── Toolbar ──────────────────────────────────────────────────────────
        toolbar = QWidget()
        toolbar.setObjectName("toolbar")
        toolbar.setFixedHeight(44)
        tb_layout = QHBoxLayout(toolbar)
        tb_layout.setContentsMargins(12, 0, 12, 0)
        tb_layout.setSpacing(10)

        # Left: identity
        title = QLabel("◈ OCTO")
        title.setObjectName("title")
        subtitle = QLabel("AUTONOMOUS AGENT SYSTEM")
        subtitle.setObjectName("subtitle")
        id_widget = QWidget()
        id_layout = QVBoxLayout(id_widget)
        id_layout.setContentsMargins(0, 4, 0, 4)
        id_layout.setSpacing(0)
        id_layout.addWidget(title)
        id_layout.addWidget(subtitle)

        # Buttons
        self._btn_reload  = _make_btn("↺ RELOAD",  tooltip="Reload dashboard (F5)")
        self._btn_voice   = _make_btn("◉ VOICE",   "#ff6b00", "Toggle voice backend")
        self._btn_agents  = _make_btn("⬡ AGENTS",  tooltip="Open agents panel")
        self._btn_setup   = _make_btn("⚙ SETUP",   "#ffcc00", "Open setup wizard")
        self._btn_fs      = _make_btn("⤢ FULL",    tooltip="Toggle fullscreen (F11)")
        self._btn_close   = _make_btn("✕", "#ff3355", "Close")

        self._status_voice = QLabel("Voice: initialising…")
        self._status_voice.setStyleSheet("color:#3a8a9a; font-family:'Courier New'; font-size:10px;")
        self._status_voice.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)

        tb_layout.addWidget(id_widget)
        tb_layout.addWidget(self._status_voice)
        tb_layout.addStretch()
        tb_layout.addWidget(self._btn_reload)
        tb_layout.addWidget(self._btn_agents)
        tb_layout.addWidget(self._btn_setup)
        tb_layout.addWidget(self._btn_voice)
        tb_layout.addWidget(self._btn_fs)
        tb_layout.addWidget(self._btn_close)
        layout.addWidget(toolbar)

        # ── Web view ─────────────────────────────────────────────────────────
        self._web = QWebEngineView()
        s = self._web.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.AutoLoadImages, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)
        # Inject SpeechRecognition stub at DocumentCreation (before page JS runs).
        # WebEngine's sandboxed Chromium crashes at the native IPC level when the
        # dashboard tries to access media.mojom.SpeechRecognizer. Injecting our mock
        # at DocumentCreation means SpeechRecognition is already replaced before
        # any dashboard code can touch the native binder.
        self._inject_speech_stub_early()
        self._web.setUrl(QUrl(DASHBOARD_URL))
        layout.addWidget(self._web)

        # ── Status bar ───────────────────────────────────────────────────────
        self._status = QStatusBar()
        self._status.showMessage(f"  ◈ OCTO Desktop  ·  Dashboard: {DASHBOARD_URL}  ·  v2.0")
        self.setStatusBar(self._status)

        # ── Wire buttons ─────────────────────────────────────────────────────
        self._btn_reload.clicked.connect(self._web.reload)
        self._btn_agents.clicked.connect(lambda: self._web.setUrl(QUrl(f"{DASHBOARD_URL}/#agents")))
        self._btn_setup.clicked.connect(lambda: self._web.setUrl(QUrl(f"{DASHBOARD_URL}/setup")))
        self._btn_fs.clicked.connect(self._toggle_fullscreen)
        self._btn_close.clicked.connect(self.close)
        self._btn_voice.clicked.connect(self._restart_voice)

        # ── Keyboard shortcuts ────────────────────────────────────────────────
        QShortcut(QKeySequence("F5"),  self).activated.connect(self._web.reload)
        QShortcut(QKeySequence("F11"), self).activated.connect(self._toggle_fullscreen)
        QShortcut(QKeySequence("Ctrl+R"), self).activated.connect(self._web.reload)

        # ── Poll server until online, then start voice ─────────────────────
        self._poll_timer = QTimer()
        self._poll_timer.setInterval(1000)
        self._poll_timer.timeout.connect(self._check_server)
        self._poll_timer.start()
        self._server_online = False

    def _inject_speech_stub_early(self):
        """Inject SpeechRecognition mock at DocumentCreation — before page JS runs.
        This prevents the native media.mojom.SpeechRecognizer IPC crash in WebEngine."""
        js = """
(function() {
  var NoopRecognition = function() {
    this.continuous = false; this.interimResults = false; this.lang = 'en-US';
    this.onresult = null; this.onerror = null; this.onend = null; this.onstart = null;
  };
  NoopRecognition.prototype.start = function() {
    if (this.onstart) this.onstart({});
    setTimeout(function(self) { if (self.onend) self.onend({}); }, 80, this);
  };
  NoopRecognition.prototype.stop  = function() {};
  NoopRecognition.prototype.abort = function() {};
  Object.defineProperty(window, 'SpeechRecognition',       { value: NoopRecognition, writable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: NoopRecognition, writable: true });
})();
"""
        script = QWebEngineScript()
        script.setName("octo-speech-stub")
        script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        script.setRunsOnSubFrames(False)
        script.setSourceCode(js)
        self._web.page().scripts().insert(script)

    def _check_server(self):
        if self._server_online:
            self._poll_timer.stop()
            return
        if _octopus_running():
            self._server_online = True
            self._poll_timer.stop()
            self._web.reload()
            self._status.showMessage(f"  ◈ OCTO online  ·  {DASHBOARD_URL}  ·  v2.0")
            _start_voice_backend(self._status_voice)
        else:
            self._status_voice.setText("Voice: waiting for Octopus server…")

    def _toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()

    def _restart_voice(self):
        self._status_voice.setText("Voice: restarting…")
        _start_voice_backend(self._status_voice)

    def closeEvent(self, event):
        global _server_proc
        if _server_proc:
            _server_proc.terminate()
        event.accept()


# ── Entry point ────────────────────────────────────────────────────────────────
def main():
    # Start Octopus server in background before showing window
    server_thread = threading.Thread(target=_start_octopus_server, daemon=True)
    server_thread.start()

    app = QApplication(sys.argv)
    app.setApplicationName("OCTO Desktop")
    app.setOrganizationName("Octopus Industries")

    win = OctoDesktopWindow()
    win.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
