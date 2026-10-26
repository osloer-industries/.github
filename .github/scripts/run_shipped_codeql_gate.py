#!/usr/bin/env python3
"""Run the CodeQL SARIF gate exactly as shipped in the reusable workflow."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = REPO_ROOT / ".github/scripts"


def main() -> int:
    sys.path.insert(0, str(SCRIPTS))
    from codeql_gate_inline import extract_inline_body  # noqa: PLC0415

    script = extract_inline_body()
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as handle:
        handle.write(script)
        path = handle.name
    completed = subprocess.run([sys.executable, path], check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
