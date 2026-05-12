"""
Incremental repo indexer.

- Only re-indexes files whose mtime has changed (token-efficient).
- Uses regex for JS/TS symbol extraction (no crash on bare `function` keyword).
- Writes to SQLite via GraphStore, then exports legacy JSON for debug.
"""
import argparse
import ast
import re
import sys
from pathlib import Path

CURRENT = Path(__file__).resolve()
PY_ROOT = CURRENT.parents[1]
if str(PY_ROOT) not in sys.path:
    sys.path.insert(0, str(PY_ROOT))

from memory.schema import MemoryStore
from memory.graph_store import GraphStore
from indexer.graph_builder import build_graph

IGNORE_DIRS = {'.git', 'node_modules', 'dist', 'build', '__pycache__', '.venv', 'venv', 'data'}
TEXT_EXTS = {'.py', '.js', '.ts', '.tsx', '.jsx', '.md', '.json', '.yaml', '.yml'}
# Output files written by build_index itself — must not be re-indexed on subsequent runs
SKIP_FILES = {'graph_index.json', 'structural_memory.json'}
_JS_FN = re.compile(r'(?:export\s+)?(?:async\s+)?function\s+(\w+)')
_JS_CLASS = re.compile(r'class\s+(\w+)')
_JS_ARROW = re.compile(r'(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(')


def summarize_text(text: str) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    return ' '.join(lines[:5])[:300]


def extract_python_symbols(text: str):
    symbols, imports = [], []
    try:
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                symbols.append(node.name)
            elif isinstance(node, ast.Import):
                imports.extend(a.name for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.append(node.module)
    except Exception:
        pass
    return sorted(set(symbols)), sorted(set(imports))


def extract_generic_symbols(text: str):
    symbols = []
    for line in text.splitlines():
        s = line.strip()
        for pattern in (_JS_FN, _JS_CLASS, _JS_ARROW):
            m = pattern.match(s)
            if m:
                symbols.append(m.group(1))
                break
    return sorted(set(symbols)), []


def should_skip(path: Path) -> bool:
    return any(part in IGNORE_DIRS for part in path.parts) or path.name in SKIP_FILES


def build_index(root: Path, db_path: str, force: bool = False):
    store = MemoryStore(db_path)
    graph = GraphStore(store.conn)

    indexed, skipped = 0, 0
    entries = []

    for path in root.rglob('*'):
        if not path.is_file() or should_skip(path) or path.suffix.lower() not in TEXT_EXTS:
            continue
        mtime = path.stat().st_mtime
        # Incremental: skip unchanged files
        if not force and graph.get_mtime(str(path.relative_to(root))) == mtime:
            skipped += 1
            continue
        try:
            text = path.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        rel = str(path.relative_to(root))
        if path.suffix.lower() == '.py':
            symbols, imports = extract_python_symbols(text)
        else:
            symbols, imports = extract_generic_symbols(text)
        graph.upsert_node(rel, symbols, imports, summarize_text(text), mtime)
        entries.append({'path': rel, 'symbols': symbols, 'imports': imports,
                        'summary': summarize_text(text), 'mtime': mtime})
        indexed += 1

    build_graph(graph, entries)
    graph.commit()

    # Legacy JSON export for debug/compatibility
    out_dir = Path(db_path).parent
    graph.export_json(str(out_dir / 'graph_index.json'))
    _write_legacy_json(out_dir, graph)

    print(f'Indexed {indexed} files, skipped {skipped} unchanged.')
    return indexed


def _write_legacy_json(out_dir: Path, graph: GraphStore):
    import json
    nodes = graph.all_nodes()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'structural_memory.json').write_text(
        json.dumps(nodes, indent=2), encoding='utf-8'
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--db', default='./data/octopus.db')
    parser.add_argument('--force', action='store_true', help='Re-index all files')
    args = parser.parse_args()
    build_index(Path(args.root).resolve(), args.db, args.force)
