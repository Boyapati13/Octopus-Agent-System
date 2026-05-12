# Quick Start: Custom Backend (JAX/Gemma)

Run Gemma locally via JAX/Flax and point Octopus at it using the `custom_http` provider.

---

## When to use this

- You want JAX-native inference (TPU, research, custom quantization)
- You have an NVIDIA GPU and prefer Flax over Ollama
- You want to run **any** OpenAI-compatible server (vLLM, LM Studio, llamafile, etc.)

For most local use cases, Ollama (`LLM_PROVIDER=ollama`) is simpler.

---

## Step 1 — Start the JAX/Gemma server

```bash
cd examples/jax-gemma-http
pip install -r requirements.txt

# Authenticate (required for gated Gemma models)
huggingface-cli login    # paste token from huggingface.co/settings/tokens
# Accept license: huggingface.co/google/gemma-3-4b-it → "Access repository"

# Start the server
python server.py --model google/gemma-3-4b-it --port 8080
```

First run: JAX compiles the model (~30–120 seconds). Subsequent runs are fast.

Expected output:
```
INFO  Loaded google/gemma-3-4b-it via Flax (JAX backend)
INFO  Starting server on http://0.0.0.0:8080
INFO
INFO  Octopus node/.env config:
INFO    LLM_PROVIDER=custom_http
INFO    CUSTOM_HTTP_URL=http://localhost:8080
INFO    CUSTOM_HTTP_MODEL=google/gemma-3-4b-it
```

---

## Step 2 — Configure Octopus

`octopus/node/.env`:
```env
LLM_PROVIDER=custom_http
CUSTOM_HTTP_URL=http://localhost:8080
CUSTOM_HTTP_MODEL=google/gemma-3-4b-it
SAFE_MODE=false
```

---

## Step 3 — Start Octopus

```bash
cd octopus/node
node src/server.js
# In another terminal:
python3 ../python/services/memory_service.py
```

---

## Step 4 — Verify

```bash
curl http://localhost:3001/api/llm/provider
# → {"provider":"custom_http","model":"google/gemma-3-4b-it"}
```

Or in the CLI:
```
❯ /provider
  Provider   custom_http
  Model      google/gemma-3-4b-it
  URL        http://localhost:8080
```

---

## Model recommendations

| Goal | Model | VRAM |
|---|---|---|
| Fastest / default | `google/gemma-3-4b-it` | ~4 GB |
| Better quality | `google/gemma-3-12b-it` | ~14 GB |
| Best local quality | `google/gemma-3-27b-it` | ~30 GB |
| Minimal VRAM | `google/gemma-3-4b-it-qat` | ~1.5 GB |

---

## Other OpenAI-compatible backends

The `custom_http` provider works with any OpenAI-compatible server:

```env
# vLLM
LLM_PROVIDER=custom_http
CUSTOM_HTTP_URL=http://localhost:8000
CUSTOM_HTTP_MODEL=mistral-7b-instruct

# LM Studio
LLM_PROVIDER=custom_http
CUSTOM_HTTP_URL=http://localhost:1234
CUSTOM_HTTP_MODEL=gemma-3-4b-it

# llamafile
LLM_PROVIDER=custom_http
CUSTOM_HTTP_URL=http://localhost:8080
CUSTOM_HTTP_MODEL=gemma-3-4b
```

---

## Sovereign fallback

If `CUSTOM_HTTP_URL` is not set, Octopus logs a clear error and does NOT fall back automatically (the URL is required for custom backends). Set `CUSTOM_HTTP_URL` or switch to a different provider.

If the custom server is down, Octopus logs:
```
[llm] All 3 attempts failed: connect ECONNREFUSED 127.0.0.1:8080
```
and throws so chains fail fast with a clear error rather than silently hanging.
