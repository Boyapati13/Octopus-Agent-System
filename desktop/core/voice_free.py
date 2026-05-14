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
    Drop-in replacement for the Gemini OctoLive backend.
    Called from main.py when no Gemini key is available.
    """

    def __init__(self, ui, execute_tool_fn: Callable):
        self.ui = ui
        self.execute_tool_fn = execute_tool_fn
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._listening = False

    def start(self):
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()

    def speak(self, text: str):
        self.ui.set_state("SPEAKING")
        self.ui.write_log(f"OCTO: {text[:120]}")
        speak_text(text)
        if not getattr(self.ui, "muted", False):
            self.ui.set_state("LISTENING")

    def _loop(self):
        from core.text_llm import complete as llm_complete

        self.ui.set_state("LISTENING")
        self.ui.write_log("SYS: OCTO voice online (free backend — Windows TTS + Google STT)")
        self.speak("OCTO online. Microphone active, sir.")

        while not self._stop.is_set():
            try:
                self.ui.set_state("LISTENING")
                self._listening = True

                # Wait for microphone activity
                got_speech = wait_for_speech(
                    threshold=0.02,
                    stop_flag=self._stop,
                )
                if not got_speech or self._stop.is_set():
                    break

                # Record 5 seconds
                self.ui.set_state("THINKING")
                self._listening = False
                self.ui.write_log("SYS: Recording...")
                pcm = record_audio(duration=5.0)

                # Transcribe
                self.ui.write_log("SYS: Transcribing...")
                text = transcribe_audio(pcm).strip()
                if not text:
                    continue

                self.ui.write_log(f"YOU: {text}")

                # Let the UI's on_text_command handler process it
                # (same path as typed commands)
                if callable(getattr(self.ui, "on_text_command", None)):
                    self.ui.on_text_command(text)
                else:
                    # Direct LLM path
                    self.ui.set_state("THINKING")
                    response = llm_complete(text, max_tokens=200, timeout=30)
                    self.speak(response)

            except Exception as e:
                print(f"[voice_free] Loop error: {e}")
                time.sleep(1)

        self.ui.write_log("SYS: Voice stopped.")
