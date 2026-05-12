# JAX/Gemma HTTP Backend

An OpenAI-compatible HTTP server that runs Gemma via JAX/Flax (with a PyTorch fallback).
Point Octopus at it using `LLM_PROVIDER=custom_http`.

---

## Why this approach

- **No vendor lock-in** — runs entirely locally, no API key needed
- **JAX-native** — BF16 mixed precision, XLA JIT, works on CPU / GPU / TPU
- **OpenAI-compatible** — Octopus's `custom_http` provider speaks the standard `/v1/chat/completions` API
- **Fallback path** — if Flax isn't available, it automatically uses PyTorch

---

## Quick Start

### 1. Install dependencies

```bash
cd examples/jax-gemma-http

# CPU (any machine)
pip install -r requirements.txt

# GPU (NVIDIA CUDA 12) — edit requirements.txt first:
#   comment out jax[cpu], uncomment jax[cuda12]
pip install -r requirements.txt
```

### 2. Authenticate with HuggingFace (for Gemma gated models)

```bash
huggingface-cli login
# Paste your HF token — get one at https://huggingface.co/settings/tokens
# Then accept the model license at https://huggingface.co/google/gemma-3-4b-it
```

### 3. Start the server

```bash
# Default: gemma-3-4b-it on localhost:8080
python server.py

# Custom model or port:
python server.py --model google/gemma-3-27b-it --port 9000

# Environment variable override:
GEMMA_MODEL=google/gemma-3-12b-it python server.py
```

The server will log:
```
INFO  Loaded google/gemma-3-4b-it via Flax (JAX backend)
INFO  Starting server on http://0.0.0.0:8080
INFO
INFO  Octopus node/.env config:
INFO    LLM_PROVIDER=custom_http
INFO    CUSTOM_HTTP_URL=http://localhost:8080
INFO    CUSTOM_HTTP_MODEL=google/gemma-3-4b-it
```

### 4. Configure Octopus

`octopus/node/.env`:
```env
LLM_PROVIDER=custom_http
CUSTOM_HTTP_URL=http://localhost:8080
CUSTOM_HTTP_MODEL=google/gemma-3-4b-it
SAFE_MODE=false
```

Start Octopus as usual:
```bash
./start_mcp.sh
```

---

## Supported Models

| Model | VRAM | Best for |
|---|---|---|
| `google/gemma-3-4b-it` | ~4 GB (BF16) | Fast tasks, default |
| `google/gemma-3-12b-it` | ~14 GB (BF16) | Balanced quality |
| `google/gemma-3-27b-it` | ~30 GB (BF16) | Best quality |
| `google/gemma-3-4b-it-qat` | ~1.5 GB | Quantized, minimal VRAM |
| `google/gemma-3-12b-it-qat` | ~3 GB | Quantized, mid-tier |

All Gemma 3 models support vision input and 128K context.

### Gemma 4 (multimodal + audio)

Gemma 4 is available via Ollama which is simpler for local use:
```bash
ollama pull gemma4:e2b   # or gemma4:26b, gemma4:31b
```
Then use `LLM_PROVIDER=ollama` instead. Use this JAX server when you specifically need
JAX-native inference (e.g., TPU, research, or custom quantization).

---

## API Reference

The server exposes the same endpoints as the OpenAI API:

```
GET  /health                    → { status, model, backend }
POST /v1/chat/completions       → OpenAI chat completion response
```

Example request:
```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-3-4b-it",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "max_tokens": 100
  }'
```

---

## Using a Different OpenAI-Compatible Server

The `custom_http` provider in Octopus works with ANY server that speaks the
OpenAI `/v1/chat/completions` API:

| Server | URL | Notes |
|---|---|---|
| **This JAX server** | `http://localhost:8080` | Gemma via JAX/Flax |
| **Ollama** (legacy path) | `http://localhost:11434` | Use `LLM_PROVIDER=ollama` instead |
| **vLLM** | `http://localhost:8000` | High-throughput, CUDA |
| **LM Studio** | `http://localhost:1234` | GUI-based, GGUF models |
| **llamafile** | `http://localhost:8080` | Single-file, zero install |
| **text-generation-webui** | `http://localhost:5000` | GGUF/GPTQ/AWQ |

For all of these, just set:
```env
LLM_PROVIDER=custom_http
CUSTOM_HTTP_URL=http://localhost:<port>
CUSTOM_HTTP_MODEL=<model-name>
```

---

## Performance Notes

- **First request**: JIT compilation (~30–120 seconds on first run; cached after)
- **Subsequent requests**: significantly faster (XLA compiled)
- **Memory**: Gemma 3 4B in BF16 uses ~4 GB VRAM. CPU runs are slow but work.
- **TPU**: Replace `jax[cpu]` with `jax[tpu]` in requirements.txt for ~10x throughput

---

## Troubleshooting

**`ModuleNotFoundError: flax`**
Install Flax: `pip install flax orbax-checkpoint`

**HuggingFace gating error**
Accept model license at `https://huggingface.co/google/gemma-3-4b-it` then run `huggingface-cli login`

**CUDA out of memory**
Use a quantized model: `--model google/gemma-3-4b-it-qat` (only ~1.5 GB VRAM)

**Slow first request**
Expected — JAX JIT compilation. Subsequent requests will be fast.

**Octopus shows `CUSTOM_HTTP_URL is not set`**
Set both `LLM_PROVIDER=custom_http` AND `CUSTOM_HTTP_URL=http://localhost:8080` in `node/.env`
