"""
JAX/Gemma HTTP Backend
──────────────────────
OpenAI-compatible /v1/chat/completions server that runs Gemma via JAX + Flax.
Expose this server and point Octopus at it with:

    LLM_PROVIDER=custom_http
    CUSTOM_HTTP_URL=http://localhost:8080
    CUSTOM_HTTP_MODEL=google/gemma-3-4b-it

Prerequisites:
    pip install -r requirements.txt

Hardware options (choose one section in __main__ at the bottom):
  A. CPU/GPU via Flax + orbax   (slowest, works on any machine)
  B. TPU via google-cloud-tpu   (fastest, requires GCP TPU quota)
  C. Mixed-precision GPU (BF16) (recommended for NVIDIA A100 / 4090)

Usage:
    python server.py [--host 0.0.0.0] [--port 8080] [--model google/gemma-3-4b-it]

Octopus node/.env:
    LLM_PROVIDER=custom_http
    CUSTOM_HTTP_URL=http://localhost:8080
    CUSTOM_HTTP_MODEL=google/gemma-3-4b-it
"""
import argparse
import json
import logging
import os
import time
import uuid
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("jax-gemma")

# ── FastAPI server ─────────────────────────────────────────────────────────────
try:
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    import uvicorn
except ImportError:
    raise SystemExit("Install server deps: pip install -r requirements.txt")

app = FastAPI(title="JAX/Gemma HTTP Backend", version="1.0.0")

# ── Model singleton ────────────────────────────────────────────────────────────
_model = None
_tokenizer = None
_model_id: str = "google/gemma-3-4b-it"


def load_model(model_id: str) -> None:
    global _model, _tokenizer, _model_id
    _model_id = model_id

    log.info(f"Loading model: {model_id}")
    try:
        # Primary: HuggingFace transformers (auto-selects JAX/Flax backend
        # when flax is installed; falls back to PyTorch when only torch is present)
        from transformers import AutoTokenizer, FlaxAutoModelForCausalLM
        _tokenizer = AutoTokenizer.from_pretrained(model_id)
        _model = FlaxAutoModelForCausalLM.from_pretrained(
            model_id,
            dtype="bfloat16",   # BF16: half the memory, nearly identical quality
        )
        log.info(f"Loaded {model_id} via Flax (JAX backend)")

    except (ImportError, Exception) as e:
        log.warning(f"Flax load failed ({e}) — trying PyTorch fallback")
        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForCausalLM
            _tokenizer = AutoTokenizer.from_pretrained(model_id)
            _model = AutoModelForCausalLM.from_pretrained(
                model_id,
                torch_dtype=torch.bfloat16,
                device_map="auto",
            )
            log.info(f"Loaded {model_id} via PyTorch")
        except Exception as e2:
            log.error(f"Model load failed: {e2}")
            raise


def _generate(prompt: str, max_new_tokens: int = 512, temperature: float = 0.7) -> str:
    """Generate a response from the loaded model."""
    if _model is None or _tokenizer is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    # Detect backend
    is_flax = hasattr(_model, "params")

    if is_flax:
        # ── JAX/Flax path ──────────────────────────────────────────────────────
        import jax
        import jax.numpy as jnp

        inputs = _tokenizer(prompt, return_tensors="jax")
        input_ids = inputs["input_ids"]

        outputs = _model.generate(
            input_ids,
            params=_model.params,
            max_new_tokens=max_new_tokens,
            do_sample=temperature > 0,
            temperature=temperature if temperature > 0 else 1.0,
        )
        generated_ids = outputs.sequences[0][input_ids.shape[-1]:]
        return _tokenizer.decode(generated_ids, skip_special_tokens=True)

    else:
        # ── PyTorch path (fallback) ───────────────────────────────────────────
        import torch

        device = next(_model.parameters()).device
        inputs = _tokenizer(prompt, return_tensors="pt").to(device)

        with torch.no_grad():
            outputs = _model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=temperature > 0,
                temperature=temperature if temperature > 0 else 1.0,
                pad_token_id=_tokenizer.eos_token_id,
            )
        generated_ids = outputs[0][inputs["input_ids"].shape[-1]:]
        return _tokenizer.decode(generated_ids, skip_special_tokens=True)


# ── OpenAI-compatible endpoints ────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model": _model_id,
        "backend": "jax-flax" if (_model is not None and hasattr(_model, "params")) else "torch",
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> JSONResponse:
    """
    OpenAI-compatible chat completions endpoint.
    Accepts the same JSON body as POST https://api.openai.com/v1/chat/completions
    and returns the same response shape.
    """
    body: dict = await request.json()
    messages: list[dict] = body.get("messages", [])
    max_tokens: int = int(body.get("max_tokens", 512))
    temperature: float = float(body.get("temperature", 0.7))
    model_req: str = body.get("model", _model_id)

    if not messages:
        return JSONResponse({"error": {"message": "messages required", "type": "invalid_request_error"}}, status_code=400)

    # Convert chat messages to a single prompt (simple concatenation for Gemma-it)
    prompt_parts = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            prompt_parts.append(f"<start_of_turn>user\n{content}<end_of_turn>\n")
        elif role == "user":
            prompt_parts.append(f"<start_of_turn>user\n{content}<end_of_turn>\n<start_of_turn>model\n")
        elif role == "assistant":
            prompt_parts.append(f"{content}<end_of_turn>\n")
    prompt = "".join(prompt_parts)

    t0 = time.time()
    try:
        text = _generate(prompt, max_new_tokens=max_tokens, temperature=temperature)
    except RuntimeError as e:
        return JSONResponse({"error": {"message": str(e), "type": "server_error"}}, status_code=503)

    elapsed_ms = int((time.time() - t0) * 1000)
    log.info(f"Generated {len(text.split())} tokens in {elapsed_ms}ms")

    # Return OpenAI-compatible response
    return JSONResponse({
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model_req,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": text},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": len(prompt.split()),
            "completion_tokens": len(text.split()),
            "total_tokens": len(prompt.split()) + len(text.split()),
        },
    })


# ── CLI entry ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="JAX/Gemma OpenAI-compatible HTTP server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8080, help="Port (default: 8080)")
    parser.add_argument("--model", default=os.environ.get("GEMMA_MODEL", "google/gemma-3-4b-it"),
                        help="HuggingFace model ID (default: google/gemma-3-4b-it)")
    args = parser.parse_args()

    load_model(args.model)

    log.info(f"Starting server on http://{args.host}:{args.port}")
    log.info(f"Model: {args.model}")
    log.info("")
    log.info("Octopus node/.env config:")
    log.info(f"  LLM_PROVIDER=custom_http")
    log.info(f"  CUSTOM_HTTP_URL=http://localhost:{args.port}")
    log.info(f"  CUSTOM_HTTP_MODEL={args.model}")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
