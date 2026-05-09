# Octopus Software Agent System

Starter full-code implementation of a memory-first software agent harness.

## Stack
- Python: memory schemas, indexing, incremental updates
- Node.js: agent registry, command router, workflow orchestration

## Run
### Python indexer
python3 python/indexer/index_repo.py --root . --out ./data

### Node orchestrator
node node/src/index.js /onboard ./data
