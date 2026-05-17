"""
voice_free.py — Free voice backend for OCTO (no Gemini key needed).

Uses:
  - sounddevice   → microphone capture (already installed)
  - pyttsx3       → Windows SAPI TTS  (David / Mark / Zira)
  - SpeechRecognition + Google free web API → STT (no key)
  - text_llm.py   → LLM routing (Anthropic / NVIDIA / Ollama)

This runs as the voice loop when GEMINI_API_KEY is not set.
The UI (OctoUI) calls start() / stop() and sets on_text_command
the same way the Gemini backend does.
"""
from __future__ import annotations

import io
import threading
import time
import wave
from typing import Callable, Optional

import numpy as np
import sounddevice as sd

_sr = None  # lazy import speech_recognition
_tts_engine = None


# ── TTS ────────────────────────────────────────────────────────────────────────
def _get_tts():
    global _tts_engine
    if _tts_engine is None:
        import pyttsx3
        _tts_engine = pyttsx3.init()
        _tts_engine.setProperty("rate", 180)
        _tts_engine.setProperty("volume", 0.95)
    return _tts_engine


def speak_text(text: str, voice_name: Optional[str] = None):
    """Speak text using Windows SAPI. Blocking."""
    try:
        engine = _get_tts()
        if voice_name:
            voices = engine.getProperty("voices")
            for v in voices:
                if voice_name.lower() in v.name.lower():
                    engine.setProperty("voice", v.id)
                    break
        engine.say(text)
        engine.runAndWait()
    except Exception as e:
        print(f"[voice_free] TTS error: {e}")


def get_available_voices() -> list[str]:
    try:
        engine = _get_tts()
        return [v.name for v in engine.getProperty("voices")]
    except Exception:
        return ["David", "Mark", "Zira"]


# ── STT ────────────────────────────────────────────────────────────────────────
def record_audio(duration: float = 5.0, samplerate: int = 16000) -> bytes:
    """Record `duration` seconds from microphone. Returns raw PCM bytes."""
    frames = int(duration * samplerate)
    recording = sd.rec(frames, samplerate=samplerate, channels=1, dtype="int16")
    sd.wait()
    return recording.tobytes()


def transcribe_audio(pcm_bytes: bytes, samplerate: int = 16000) -> str:
    """Convert raw PCM to text using Google's free web API."""
    global _sr
    if _sr is None:
        import speech_recognition as sr_module
        _sr = sr_module

    # Build a WAV in memory
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # int16 = 2 bytes
        wf.setframerate(samplerate)
        wf.writeframes(pcm_bytes)
    wav_io.seek(0)

    recognizer = _sr.Recognizer()
    recognizer.energy_threshold = 300
    recognizer.dynamic_energy_threshold = True

    with _sr.AudioFile(wav_io) as source:
        audio = recognizer.record(source)

    try:
        # Google free web API — no key needed, ~50 req/day limit
        return recognizer.recognize_google(audio)
    except _sr.UnknownValueError:
        return ""
    except _sr.RequestError as e:
        print(f"[voice_free] Google STT unavailable: {e}")
        # Windows fallback
        try:
            return recognizer.recognize_sphinx(audio)
        except Exception:
            return ""


# ── Energy detection (auto start recording on speech) ─────────────────────────
def wait_for_speech(
    threshold: float = 0.015,
    samplerate: int = 16000,
    chunk_ms: int = 100,
    stop_flag: Optional[threading.Event] = None,
) -> bool:
    """Block until microphone energy exceeds threshold or stop_flag is set."""
    chunk_frames = int(samplerate * chunk_ms / 1000)
    while True:
        if stop_flag and stop_flag.is_set():
            return False
        chunk = sd.rec(chunk_frames, samplerate=samplerate, channels=1, dtype="float32")
        sd.wait()
        rms = float(np.sqrt(np.mean(chunk ** 2)))
        if rms > threshold:
            return True


# ── Main voice loop ────────────────────────────────────────────────────────────
class FreeVoiceBackend:
    """
    Free voice backend: Windows SAPI TTS (pyttsx3) + Google free STT.
    Works with zero API keys. Microphone ACTIVE button triggers a 6-second listen.
    """

    def __init__(self, ui, execute_tool_fn: Callable):
        self.ui = ui
        self.execute_tool_fn = execute_tool_fn
        self._stop    = threading.Event()
        self._trigger = threading.Event()   # set by mic button press
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.name = "OctoVoice"
        self._thread.start()

    def stop(self):
        self._stop.set()
        self._trigger.set()  # unblock any waiting .wait()

    def trigger_listen(self):
        """Called when user presses the MICROPHONE ACTIVE button."""
        self._trigger.set()

    def _ask_server(self, text: str) -> str:
        """
        Post to /api/tasks/ask and poll /api/status until the answer is ready.
        Falls back to direct LLM if the server is unreachable.
        Returns the answer string (may be empty on timeout).
        """
        try:
            import requests as _r
            r = _r.post(
                "http://localhost:3001/api/tasks/ask",
                json={"text": text},
                timeout=10,
            )
            data = r.json()
            project_id = data.get("project_id", "")

            # Poll until done (max 45 s)
            for _ in range(22):
                time.sleep(2)
                try:
                    sr = _r.get("http://localhost:3001/api/status", timeout=5)
                    projects = sr.json().get("projects", [])
                    proj = next((p for p in projects if p.get("id") == project_id), None)
                    if not proj:
                        # single-project fallback
                        proj = next(iter(sr.json().get("projects", [])), None)
                    if proj:
                        ans = proj.get("answer", "")
                        status = proj.get("answer_status", "running")
                        if ans and status == "done" and ans not in (
                            "Working…", "Processing…", "Searching…", "Task interrupted."
                        ):
                            self.ui.write_log(f"OCTO: {ans[:300]}")
                            return ans
                except Exception:
                    break

        except Exception:
            pass

        # Server unreachable — answer directly via LLM
        try:
            from core.text_llm import complete as llm_complete
            ans = llm_complete(text, max_tokens=250, timeout=45)
            self.ui.write_log(f"OCTO: {ans[:300]}")
            return ans
        except Exception as e:
            self.ui.write_log(f"SYS: LLM error — {e}")
            return ""

    def speak(self, text: str):
        """Speak using Windows SAPI. COM-safe: initialises per-thread."""
        self.ui.set_state("SPEAKING")
        self.ui.write_log(f"OCTO: {text[:160]}")
        # Run TTS in its own thread to avoid blocking the voice loop
        # and to get a fresh COM context each time (Windows STA requirement)
        done = threading.Event()
        def _tts():
            try:
                import pythoncom
                pythoncom.CoInitialize()
            except ImportError:
                pass
            speak_text(text)
            done.set()
        threading.Thread(target=_tts, daemon=True).start()
        done.wait(timeout=30)
        if not getattr(self.ui, "muted", False):
            self.ui.set_state("LISTENING")

    def _loop(self):
        # COM init for this thread (required for pyttsx3 on Windows)
        try:
            import pythoncom
            pythoncom.CoInitialize()
        except ImportError:
            pass

        self.ui.set_state("LISTENING")
        self.ui.write_log("SYS: OCTO voice ready — press MICROPHONE ACTIVE to speak")
        self.speak("OCTO voice active. Press the microphone button and speak, sir.")

        while not self._stop.is_set():
            # Wait for the user to press the mic button (push-to-talk)
            self._trigger.wait()
            self._trigger.clear()

            if self._stop.is_set():
                break

            try:
                # 0.5s pre-delay so button-click noise doesn't get recorded
                time.sleep(0.5)

                self.ui.set_state("EXECUTE")  # visual cue: recording
                self.ui.write_log("SYS: Listening for 6 seconds... speak now")

                pcm = record_audio(duration=6.0)

                self.ui.set_state("THINKING")
                self.ui.write_log("SYS: Transcribing...")

                text = transcribe_audio(pcm).strip()
                if not text:
                    self.ui.write_log("SYS: Could not hear speech — try again")
                    self.ui.set_state("LISTENING")
                    continue

                self.ui.write_log(f"YOU: {text}")

                # Route to Octopus server and poll for the answer
                self.ui.set_state("THINKING")
                answer = self._ask_server(text)
                if answer:
                    self.speak(answer)
                else:
                    self.ui.write_log("SYS: No answer received — try again")
                    self.ui.set_state("LISTENING")

            except Exception as e:
                print(f"[voice_free] Loop error: {e}")
                self.ui.write_log(f"SYS: Voice error — {str(e)[:80]}")
                self.ui.set_state("LISTENING")

        self.ui.write_log("SYS: Voice stopped.")
