#!/usr/bin/env python3
"""
gemma_service.py — Local Gemma inference server (no Ollama needed).

Uses the `transformers` library to load any Gemma model from Hugging Face
and exposes an Ollama-compatible /api/generate endpoint so Octopus can use it
with LLM_PROVIDER=ollama and OLLAMA_BASE_URL=http://localhost:11435

Usage:
    # Install dependencies once:
    pip install transformers accelerate torch

    # Start the server (downloads model on first run ~3-17 GB):
    py python/services/gemma_service.py

    # Or specify a different model:
    GEMMA_MODEL=google/gemma-3-12b-it py python/services/gemma_service.py

    # In node/.env or MCP env:
    LLM_PROVIDER=ollama
    LLM_MODEL=google/gemma-3-4b-it
    OLLAMA_BASE_URL=http://localhost:11435

Supported models (no Ollama, downloaded from Hugging Face):
    google/gemma-3-1b-it       ~1 GB   fastest, basic tasks
    google/gemma-3-4b-it       ~3 GB   good balance (default)
    google/gemma-3-12b-it      ~8 GB   high quality
    google/gemma-3-27b-it      ~17 GB  best Gemma 3
    google/gemma-2-9b-it       ~9 GB   Gemma 2, tool calling
    google/gemma-2-27b-it      ~27 GB  best Gemma 2

Note: Gemma 4 weights require accepting Google's licence on Hugging Face.
For Gemma 4, use Ollama (ollama pull gemma4:e2b) which handles auth.
"""

import os
import sys
import json
import time
import threading
import logging

from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO, format='[gemma_service] %(message)s')
log = logging.getLogger(__name__)

app = Flask(__name__)

MODEL_NAME  = os.environ.get('GEMMA_MODEL', 'google/gemma-3-4b-it')
PORT        = int(os.environ.get('GEMMA_PORT', 11435))
HF_TOKEN    = os.environ.get('HF_TOKEN') or os.environ.get('HUGGINGFACE_API_KEY')

_pipeline   = None
_lock       = threading.Lock()
_ready      = False


def load_model():
    global _pipeline, _ready
    try:
        import torch
        from transformers import pipeline

        log.info(f'Loading model: {MODEL_NAME}')
        log.info('This may take a few minutes on first run (downloading weights)...')

        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        dtype  = torch.float16 if device == 'cuda' else torch.float32
        log.info(f'Device: {device}  dtype: {dtype}')

        kwargs = dict(
            model=MODEL_NAME,
            device_map='auto' if device == 'cuda' else None,
            torch_dtype=dtype,
        )
        if HF_TOKEN:
            kwargs['token'] = HF_TOKEN

        _pipeline = pipeline('text-generation', **kwargs)
        _ready = True
        log.info(f'Model ready: {MODEL_NAME}  (port {PORT})')

    except ImportError as e:
        log.error(f'Missing dependency: {e}')
        log.error('Run: pip install transformers accelerate torch')
        sys.exit(1)
    except Exception as e:
        log.error(f'Failed to load model: {e}')
        log.error('If this is an auth error, set HF_TOKEN=your_token (accept licence at huggingface.co/google/gemma-3-4b-it)')
        sys.exit(1)


# ── Routes (Ollama-compatible) ────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok' if _ready else 'loading', 'model': MODEL_NAME})


@app.route('/api/tags', methods=['GET'])
def tags():
    """Mimic Ollama /api/tags so cross-link.js detects this as an Ollama instance."""
    return jsonify({'models': [{'name': MODEL_NAME, 'details': {'family': 'gemma', 'parameter_size': 'unknown'}}]})


@app.route('/api/generate', methods=['POST'])
def generate():
    if not _ready:
        return jsonify({'error': 'Model still loading'}), 503

    data        = request.get_json(force=True) or {}
    prompt      = data.get('prompt', '')
    max_tokens  = data.get('options', {}).get('num_predict', 1024)

    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400

    try:
        with _lock:
            t0      = time.time()
            result  = _pipeline(
                prompt,
                max_new_tokens=max_tokens,
                do_sample=False,
                return_full_text=False,
            )
            elapsed = round(time.time() - t0, 2)
        text = result[0]['generated_text']
        log.info(f'Generated {len(text)} chars in {elapsed}s')
        return jsonify({'response': text, 'done': True, 'model': MODEL_NAME, 'elapsed_s': elapsed})

    except Exception as e:
        log.error(f'Generation error: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    """OpenAI-compatible endpoint for clients that prefer it."""
    if not _ready:
        return jsonify({'error': 'Model still loading'}), 503

    data     = request.get_json(force=True) or {}
    messages = data.get('messages', [])
    max_toks = data.get('max_tokens', 1024)

    # Flatten messages to a simple prompt
    prompt = '\n'.join(f"{m['role'].upper()}: {m['content']}" for m in messages) + '\nASSISTANT:'

    with _lock:
        result = _pipeline(prompt, max_new_tokens=max_toks, do_sample=False, return_full_text=False)

    text = result[0]['generated_text'].strip()
    return jsonify({
        'choices': [{'message': {'role': 'assistant', 'content': text}, 'finish_reason': 'stop'}],
        'model': MODEL_NAME,
    })


if __name__ == '__main__':
    # Load model in background thread so Flask starts fast
    t = threading.Thread(target=load_model, daemon=True)
    t.start()

    log.info(f'Starting Gemma service on http://localhost:{PORT}')
    log.info(f'Model: {MODEL_NAME}')
    log.info(f'Set in node/.env:  LLM_PROVIDER=ollama  LLM_MODEL={MODEL_NAME}  OLLAMA_BASE_URL=http://localhost:{PORT}')

    app.run(host='0.0.0.0', port=PORT, debug=False)
