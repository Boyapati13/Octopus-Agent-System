"""
text_llm.py — Multi-provider text LLM adapter for Mark-XXXIX
Mirrors Octopus llm.js but in Python.

Provider priority (auto mode):
  1. Anthropic  — if anthropic_api_key set
  2. NVIDIA NIM — if nvidia_api_key set
  3. OpenRouter — if openrouter_api_key set (Hermes-3 default)
  4. Gemini text — if gemini_api_key set
  5. HuggingFace — if hf_token set
  6. Ollama      — always available locally (sovereign fallback)

Usage:
  from core.text_llm import complete, get_provider

  answer = complete("Write a hello world in Python")
  answer = complete("Plan this project", system="You are a planner...")
  answer = complete("Review this code", provider="anthropic", model="claude-sonnet-4-6")
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

import requests

# ── Path helpers ───────────────────────────────────────────────────────────────
def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent

BASE_DIR        = _base_dir()
API_CONFIG_PATH = BASE_DIR / "config" / "api_keys.json"
# Octopus .env path — keys are shared to avoid double-config
OCTOPUS_ENV_PATH = BASE_DIR.parent / "octopus-software-full" / "node" / ".env"

# ── Key loading — 3-tier cascade ───────────────────────────────────────────────
def _load_config() -> dict:
    try:
        return json.loads(API_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}

def _parse_dotenv(path: Path) -> dict:
    result = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                result[k.strip()] = v.strip()
    except Exception:
        pass
    return result

def _get_key(config_field: str, env_var: str) -> Optional[str]:
    """3-tier: config/api_keys.json → os.environ → Octopus .env"""
    cfg = _load_config()
    v = cfg.get(config_field, "")
    if v and v not in ("", "YOUR_KEY_HERE", "YOUR_GEMINI_API_KEY_HERE"):
        return v
    v = os.environ.get(env_var, "")
    if v:
        return v
    env = _parse_dotenv(OCTOPUS_ENV_PATH)
    return env.get(env_var) or None

def get_gemini_key()      -> Optional[str]: return _get_key("gemini_api_key",    "GOOGLE_API_KEY")
def get_anthropic_key()   -> Optional[str]: return _get_key("anthropic_api_key", "ANTHROPIC_API_KEY")
def get_nvidia_key()      -> Optional[str]: return _get_key("nvidia_api_key",    "NVIDIA_API_KEY")
def get_openrouter_key()  -> Optional[str]: return _get_key("openrouter_api_key","OPENROUTER_API_KEY")
def get_hf_token()        -> Optional[str]: return _get_key("hf_token",          "HF_TOKEN")
def get_ollama_base()     -> str:
    return _load_config().get("ollama_base_url") or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

# ── Default models ─────────────────────────────────────────────────────────────
DEFAULT_MODELS = {
    "anthropic":   "claude-sonnet-4-6",
    "nvidia":      "meta/llama-3.1-405b-instruct",
    "openrouter":  "nousresearch/hermes-3-llama-3.1-405b",
    "gemini":      "gemini-2.5-flash-lite",
    "huggingface": "google/gemma-3-4b-it",
    "ollama":      "gemma4:e2b",
}

# ── Provider detection ─────────────────────────────────────────────────────────
def get_provider() -> str:
    """Returns the active provider name based on available keys."""
    cfg = _load_config()
    override = cfg.get("text_llm_provider", "auto")
    if override and override != "auto":
        return override

    if get_anthropic_key():   return "anthropic"
    if get_nvidia_key():      return "nvidia"
    if get_openrouter_key():  return "openrouter"
    if get_gemini_key():      return "gemini"
    if get_hf_token():        return "huggingface"
    return "ollama"

def get_model(provider: Optional[str] = None) -> str:
    p = provider or get_provider()
    cfg = _load_config()
    override = cfg.get("text_llm_model", "")
    if override:
        return override
    return DEFAULT_MODELS.get(p, "gemma4:e2b")

# ── Completers ─────────────────────────────────────────────────────────────────

def _build_messages(prompt: str, system: Optional[str]) -> list:
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    return msgs

def _complete_anthropic(prompt: str, system: Optional[str], model: str, max_tokens: int, timeout: int) -> str:
    key = get_anthropic_key()
    body: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        body["system"] = system
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json=body,
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["content"][0]["text"]

def _complete_nvidia(prompt: str, system: Optional[str], model: str, max_tokens: int, timeout: int) -> str:
    key = get_nvidia_key()
    messages = _build_messages(prompt, system)
    r = requests.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "content-type": "application/json"},
        json={"model": model, "max_tokens": max_tokens, "messages": messages, "stream": False},
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def _complete_openrouter(prompt: str, system: Optional[str], model: str, max_tokens: int, timeout: int) -> str:
    key = get_openrouter_key()
    messages = _build_messages(prompt, system)
    r = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://mark-xxxix.local",
            "X-Title": "Mark-XXXIX",
        },
        json={"model": model, "max_tokens": max_tokens, "messages": messages, "stream": False},
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def _complete_gemini_text(prompt: str, system: Optional[str], model: str, max_tokens: int, timeout: int) -> str:
    import google.generativeai as genai
    genai.configure(api_key=get_gemini_key())
    m = genai.GenerativeModel(model_name=model, system_instruction=system or "")
    resp = m.generate_content(prompt, generation_config={"max_output_tokens": max_tokens})
    return resp.text.strip()

def _complete_huggingface(prompt: str, system: Optional[str], model: str, max_tokens: int, timeout: int) -> str:
    key = get_hf_token()
    messages = _build_messages(prompt, system)
    r = requests.post(
        f"https://router.huggingface.co/hf-inference/models/{model}/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "content-type": "application/json"},
        json={"model": model, "messages": messages, "max_tokens": max_tokens, "stream": False},
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def _complete_ollama(prompt: str, system: Optional[str], model: str, max_tokens: int, timeout: int) -> str:
    base = get_ollama_base()
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        r = requests.post(
            f"{base}/api/chat",
            json={"model": model, "messages": messages, "stream": False, "think": False,
                  "options": {"num_predict": max_tokens}},
            timeout=timeout,
        )
        r.raise_for_status()
        content = (r.json().get("message") or {}).get("content", "").strip()
        if content:
            return content
        raise ValueError("empty response from Ollama chat")
    except Exception:
        # fallback to generate endpoint for base models
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        r = requests.post(
            f"{base}/api/generate",
            json={"model": model, "prompt": full_prompt, "stream": False,
                  "options": {"num_predict": max_tokens}},
            timeout=timeout,
        )
        r.raise_for_status()
        return r.json().get("response", "").strip()

# ── Dispatch table ─────────────────────────────────────────────────────────────
_COMPLETERS = {
    "anthropic":   _complete_anthropic,
    "nvidia":      _complete_nvidia,
    "openrouter":  _complete_openrouter,
    "gemini":      _complete_gemini_text,
    "huggingface": _complete_huggingface,
    "ollama":      _complete_ollama,
}

# ── Public API ─────────────────────────────────────────────────────────────────

def complete(
    prompt: str,
    *,
    system: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    max_tokens: int = 2048,
    timeout: int = 60,
) -> str:
    """
    Call any configured LLM provider for text completion.

    Args:
        prompt:     User prompt / task description
        system:     Optional system instruction
        provider:   Override provider (anthropic/nvidia/openrouter/gemini/huggingface/ollama)
        model:      Override model name
        max_tokens: Max output tokens (default 2048)
        timeout:    Request timeout in seconds (default 60)

    Returns:
        Text response string
    """
    p = provider or get_provider()
    m = model or get_model(p)

    fn = _COMPLETERS.get(p)
    if not fn:
        raise ValueError(f"Unknown provider '{p}'. Valid: {list(_COMPLETERS)}")

    print(f"[text_llm] {p}/{m} — {len(prompt)} chars")

    try:
        result = fn(prompt, system, m, max_tokens, timeout)
        return result
    except Exception as e:
        # Sovereign fallback: if cloud provider fails, try Ollama
        if p != "ollama":
            print(f"[text_llm] {p} failed ({e}), falling back to Ollama")
            try:
                ollama_model = _load_config().get("sovereign_fallback_model", "qwen2.5-coder:1.5b-base")
                return _complete_ollama(prompt, system, ollama_model, max_tokens, timeout)
            except Exception as e2:
                raise RuntimeError(f"{p} failed: {e}; Ollama fallback also failed: {e2}")
        raise
