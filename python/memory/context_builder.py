"""
L5 Task Context Profile — built on demand, per agent, never stored.

Each agent gets only what it needs; irrelevant layers are excluded.
Context is cached in L4 (Redis/memory) with a short TTL to avoid
rebuilding on repeated calls within the same session.

ECC Integration (three injected layers, in priority order):
  1. OCTOPUS.md Constitution  — developer-defined hard rules (PROJECT_ROOT/OCTOPUS.md)
  2. ECC Guardrails           — ECC_RULES_PATH/*.md files (always-loaded language rules)
  3. Instincts                — high-confidence learned patterns from L2 instincts table
"""
import os
import hashlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .graph_store import GraphStore
    from .schema import MemoryStore
    from .cache import CacheStore


# ── OCTOPUS.md Constitution ────────────────────────────────────────────────────

def _load_constitution() -> str:
    """Read OCTOPUS.md from PROJECT_ROOT. Returns empty string if absent."""
    root  = os.environ.get('PROJECT_ROOT', '.')
    fpath = os.path.join(root, 'OCTOPUS.md')
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except (FileNotFoundError, PermissionError, OSError):
        return ''


# ── ECC Rules (guardrails from ECC_RULES_PATH) ───────────────────────────────

def _load_ecc_rules() -> str:
    """
    Load ECC rule files from ECC_RULES_PATH (defaults to .claude/rules/).
    Concatenates all *.md files found there — mirrors ECC's always-loaded rules.
    """
    rules_path = os.environ.get(
        'ECC_RULES_PATH',
        os.path.join(os.environ.get('PROJECT_ROOT', '.'), '.claude', 'rules')
    )
    rules = []
    try:
        for fname in sorted(os.listdir(rules_path)):
            if fname.endswith('.md'):
                fpath = os.path.join(rules_path, fname)
                try:
                    with open(fpath, 'r', encoding='utf-8') as f:
                        content = f.read().strip()
                        if content:
                            rules.append(f'## {fname}\n{content}')
                except (PermissionError, OSError):
                    pass
    except (FileNotFoundError, NotADirectoryError):
        pass
    return '\n\n'.join(rules)


# ── Instincts (ECC Continuous Learning v2) ────────────────────────────────────

def _load_instincts(store: 'MemoryStore', limit: int = 10) -> list:
    """
    Fetch high-confidence instincts from the L2 instincts table.
    Only instincts with confidence >= 0.7 are injected into context.
    """
    if store is None:
        return []
    try:
        return store.load_instincts(min_confidence=0.7, limit=limit)
    except Exception:
        return []


# ── Per-agent include/exclude rules ───────────────────────────────────────────

AGENT_PROFILES = {
    'cortex':            {'inc': ['run_state', 'decisions', 'instincts'],            'exc': ['raw_ast']},
    'atlas':             {'inc': ['structural', 'symbols'],                           'exc': ['run_state', 'decisions']},
    'architect':         {'inc': ['structural', 'boundary_impact', 'instincts'],     'exc': ['run_details']},
    'forge':             {'inc': ['structural', 'decisions', 'run_state', 'instincts'], 'exc': ['security_findings']},
    'reviewer':          {'inc': ['changed_files', 'structural'],                     'exc': ['unrelated_modules']},
    'security-reviewer': {'inc': ['structural', 'imports', 'instincts'],             'exc': ['docs', 'notebook_history']},
    'probe':             {'inc': ['structural', 'changed_files'],                    'exc': ['decisions']},
    'scribe':            {'inc': ['changed_files', 'decisions', 'run_notes'],        'exc': ['ast', 'security']},
    'release-keeper':    {'inc': ['run_state', 'approvals'],                         'exc': ['source_code']},
    'marketscout':       {'inc': ['decisions', 'instincts'],                         'exc': ['raw_ast', 'structural']},
    'toolsmith':         {'inc': ['structural', 'decisions', 'instincts'],           'exc': []},
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
    Checks L4 cache first; builds from L1–L3 + instincts on miss.

    Priority order for injected layers (first = highest weight for LLM):
      1. constitution   — OCTOPUS.md hard rules
      2. ecc_rules      — always-loaded language/security rules from ECC_RULES_PATH
      3. instincts      — high-confidence learned patterns (confidence >= 0.7)
      4. structural / decisions / run_state — standard L1–L3 data
    """
    q = query or task

    # Include constitution + ECC rules in cache key so the cache invalidates on change
    constitution   = _load_constitution()
    ecc_rules      = _load_ecc_rules()
    combined_rules = constitution + ecc_rules
    rules_sig      = hashlib.md5(combined_rules.encode()).hexdigest()[:8] if combined_rules else 'none'
    cache_key      = f"ctx:{agent_name}:{hash(q)}:{rules_sig}"

    if cache:
        cached = cache.get(cache_key)
        if cached:
            return cached

    profile = AGENT_PROFILES.get(agent_name, {'inc': ['structural', 'run_state'], 'exc': []})
    inc     = profile['inc']

    ctx = {
        'agent':    agent_name,
        'task':     task,
        'query':    q,
        'excluded': profile['exc'],
    }

    # ── Layer 1: OCTOPUS.md Constitution ────────────────────────────────────
    # Injected first — maximum LLM attention weight
    if constitution:
        ctx['constitution'] = constitution

    # ── Layer 2: ECC Rules (always-loaded guardrails) ────────────────────────
    if ecc_rules:
        ctx['ecc_rules'] = ecc_rules

    # ── Layer 3: Instincts (Continuous Learning v2) ──────────────────────────
    if 'instincts' in inc and store:
        instincts = _load_instincts(store)
        if instincts:
            ctx['instincts'] = [
                {'pattern': i['pattern'], 'confidence': i['confidence'], 'category': i['category']}
                for i in instincts
            ]

    # ── Layer 4: L1 Structural Memory ───────────────────────────────────────
    if graph_store:
        if 'structural' in inc or 'symbols' in inc or 'imports' in inc:
            ctx['relevant_files'] = graph_store.score_relevance(q, limit=10)

        if 'boundary_impact' in inc:
            seed_paths             = [f['path'] for f in ctx.get('relevant_files', [])]
            ctx['boundary_impact'] = graph_store.boundary_impact(seed_paths)

        if 'changed_files' in inc and store:
            run     = store.load_run()
            changed = run.get('changed_files', [])
            ctx['changed_files'] = changed
            if changed and graph_store:
                ctx['changed_file_symbols'] = [
                    graph_store.get_node(p) for p in changed if graph_store.get_node(p)
                ]

    # ── Layer 4: L2/L3 Decisions + Run State ────────────────────────────────
    if store:
        if 'run_state' in inc or 'approvals' in inc or 'run_notes' in inc:
            ctx['run_state'] = store.load_run()

        if 'decisions' in inc:
            ctx['recent_decisions'] = store.load_decisions(limit=5)

    if cache:
        cache.set(cache_key, ctx, ttl=300)

    return ctx
