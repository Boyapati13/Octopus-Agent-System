"""Tests for python/indexer/index_repo.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from indexer.index_repo import (
    summarize_text, extract_python_symbols,
    extract_generic_symbols, should_skip, build_index,
)


def test_summarize_text_basic():
    text = 'line one\nline two\nline three\nline four\nline five\nline six'
    result = summarize_text(text)
    assert 'line one' in result
    assert len(result) <= 300


def test_summarize_text_empty():
    assert summarize_text('') == ''


def test_extract_python_symbols():
    code = '''
def foo(): pass
class Bar: pass
async def baz(): pass
'''
    symbols, imports = extract_python_symbols(code)
    assert 'foo' in symbols
    assert 'Bar' in symbols
    assert 'baz' in symbols


def test_extract_python_imports():
    code = 'import os\nimport sys\nfrom pathlib import Path\nfrom memory.schema import MemoryStore'
    _, imports = extract_python_symbols(code)
    assert 'os' in imports
    assert 'memory.schema' in imports


def test_extract_python_syntax_error_graceful():
    symbols, imports = extract_python_symbols('def broken(')
    assert symbols == []
    assert imports == []


def test_extract_generic_function():
    code = 'function myFunc() {}\nexport function exported() {}'
    symbols, _ = extract_generic_symbols(code)
    assert 'myFunc' in symbols
    assert 'exported' in symbols


def test_extract_generic_class():
    symbols, _ = extract_generic_symbols('class MyClass {}')
    assert 'MyClass' in symbols


def test_extract_generic_no_crash_on_bare_keyword():
    # Previously crashed with IndexError
    symbols, _ = extract_generic_symbols('function\nclass\nexport function')
    assert isinstance(symbols, list)


def test_extract_generic_arrow():
    symbols, _ = extract_generic_symbols('const handler = async (x) => x')
    assert 'handler' in symbols


def test_should_skip_node_modules():
    path = Path('project/node_modules/lib/index.js')
    assert should_skip(path)


def test_should_skip_pycache():
    path = Path('python/__pycache__/schema.cpython-311.pyc')
    assert should_skip(path)


def test_should_not_skip_regular():
    path = Path('src/app.py')
    assert not should_skip(path)


def test_build_index_incremental(tmp_path):
    # Create a small repo
    src = tmp_path / 'src'
    src.mkdir()
    (src / 'hello.py').write_text('def hello(): pass\n')
    db = str(tmp_path / 'test.db')
    count1 = build_index(tmp_path, db)
    assert count1 >= 1
    # Second run — nothing changed, should skip all
    count2 = build_index(tmp_path, db)
    assert count2 == 0
