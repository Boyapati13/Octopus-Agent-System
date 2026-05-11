"""
L5 Task Context Profile — built on demand, per agent, never stored.

Each agent gets only what it needs; irrelevant layers are excluded.
Context is cached in L4 (Redis/memory) with a short TTL to avoid
rebuilding on repeated calls within the same session.

OCTOPUS.md Constitution: if the developer has placed an OCTOPUS.md at the
project root (PROJECT_ROOT env var), its contents are injected at the very
top of every agent's context as an unbreakable source of truth — overriding
any LLM tendency to use deprecated libraries, banned patterns, etc.
"""
import os
import hashlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .graph_store import GraphStore
    from .schema import MemoryStore
    from .cache import CacheStore

def _load_constitution() -> str:
    """Read OCTOPUS.md from PROJECT_ROOT. Returns empty string if absent."""
    root = os.environ.get('PROJECT_ROOT', '.')
    fpath = os.path.join(root, 'OCTOPUS.md')
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except (FileNotFoundError, PermissionError, OSError):
        return ''


# Per-agent include/exclude rules.
# 'includes' drives which data sources are queried.
AGENT_PROFILES = {
    'cortex':            {'inc': ['run_state', 'decisions'],                    'exc': ['raw_ast']},
    'atlas':             {'inc': ['structural', 'symbols'],                     'exc': ['run_state', 'decisions']},
    'architect':         {'inc': ['structural', 'boundary_impact'],             'exc': ['run_details']},
    'forge':             {'inc': ['structural', 'decisions', 'run_state'],      'exc': ['security_findings']},
    'reviewer':          {'inc': ['changed_files', 'structural'],               'exc': ['unrelated_modules']},
    'security-reviewer': {'inc': ['structural', 'imports'],                     'exc': ['docs', 'notebook_history']},
    'probe':             {'inc': ['structural', 'changed_files'],               'exc': ['decisions']},
    'scribe':            {'inc': ['changed_files', 'decisions', 'run_notes'],   'exc': ['ast', 'security']},
    'release-keeper':    {'inc': ['run_state', 'approvals'],                    'exc': ['source_code']},
}


def build_context(
    agent_name: str,
    task: str,
    query: str = None,
    graph_store: 'GraphStore' = None,
    store: 'MemoryStore' = None,
    cache: 'CacheStore' = None,
) -> dict:
    """
    Assemble a compact context package for the named agent.
    Checks L4 cache first; builds from L1–L3 on miss.
    """
    q = query or task

    # Constitution is included in cache key so the cache invalidates when OCTOPUS.md changes
    constitution = _load_constitution()
    constitution_sig = hashlib.md5(constitution.encode()).hexdigest()[:8] if constitution else 'none'
    cache_key = f"ctx:{agent_name}:{hash(q)}:{constitution_sig}"

    if cache:
        cached = cache.get(cache_key)
        if cached:
            return cached

    profile = AGENT_PROFILES.get(agent_name, {'inc': ['structural', 'run_state'], 'exc': []})
    inc = profile['inc']
    ctx = {
        'agent': agent_name,
        'task': task,
        'query': q,
        'excluded': profile['exc'],
    }

    # Inject OCTOPUS.md first — unbreakable developer constitution.
    # Placed before all other context so the LLM sees it with maximum weight.
    if constitution:
        ctx['constitution'] = constitution

    if graph_store:
        if 'structural' in inc or 'symbols' in inc or 'imports' in inc:
            ctx['relevant_files'] = graph_store.score_relevance(q, limit=10)

        if 'boundary_impact' in inc:
            seed_paths = [f['path'] for f in ctx.get('relevant_files', [])]
            ctx['boundary_impact'] = graph_store.boundary_impact(seed_paths)

        if 'changed_files' in inc and store:
            run = store.load_run()
            changed = run.get('changed_files', [])
            ctx['changed_files'] = changed
            if changed and graph_store:
                ctx['changed_file_symbols'] = [
                    graph_store.get_node(p) for p in changed if graph_store.get_node(p)
                ]

    if store:
        if 'run_state' in inc or 'approvals' in inc or 'run_notes' in inc:
            ctx['run_state'] = store.load_run()

        if 'decisions' in inc:
            ctx['recent_decisions'] = store.load_decisions(limit=5)

    if cache:
        cache.set(cache_key, ctx, ttl=300)

    return ctx
