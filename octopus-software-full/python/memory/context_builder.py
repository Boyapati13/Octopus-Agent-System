"""
L5 Task Context Profile — built on demand, per agent, never stored.

Each agent gets only what it needs; irrelevant layers are excluded.
Context is cached in L4 (Redis/memory) with a short TTL to avoid
rebuilding on repeated calls within the same session.
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .graph_store import GraphStore
    from .schema import MemoryStore
    from .cache import CacheStore

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
    cache_key = f"ctx:{agent_name}:{hash(q)}"

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
