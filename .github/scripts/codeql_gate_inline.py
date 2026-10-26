#!/usr/bin/env python3
"""Extract and verify the inline CodeQL SARIF gate shipped in the reusable workflow."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPO_ROOT / ".github/workflows/codeql-javascript-typescript.yml"
CANONICAL = REPO_ROOT / ".github/scripts/codeql-sarif-security-gate.py"
MARKER = "CODEQL_SARIF_GATE_INLINE"
INLINE_INDENT = "          "


def canonical_body() -> str:
    text = CANONICAL.read_text(encoding="utf-8")
    lines = text.splitlines()
    if lines and lines[0].startswith("#!"):
        lines = lines[1:]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines) + "\n"


def _indent_script(body: str) -> str:
    return "".join(f"{INLINE_INDENT}{line}\n" for line in body.splitlines())


def extract_inline_body(workflow_path: Path = WORKFLOW) -> str:
    content = workflow_path.read_text(encoding="utf-8")
    pattern = rf"^[ \t]*python3 <<'{MARKER}'\n(.*?)\n[ \t]*{MARKER}[ \t]*\n"
    match = re.search(pattern, content, re.DOTALL | re.MULTILINE)
    if not match:
        raise ValueError(
            f"Inline gate marker <<'{MARKER}' not found in {workflow_path}"
        )
    raw = match.group(1)
    lines = raw.splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        return ""
    stripped: list[str] = []
    for line in lines:
        if not line.strip():
            stripped.append("")
            continue
        if not line.startswith(INLINE_INDENT):
            raise ValueError(
                "Inline gate line missing workflow indent prefix: "
                f"{line[:40]!r}"
            )
        stripped.append(line[len(INLINE_INDENT) :])
    while stripped and not stripped[0].strip():
        stripped.pop(0)
    while stripped and not stripped[-1].strip():
        stripped.pop()
    return "\n".join(stripped) + "\n"


def assert_inline_matches_canonical() -> None:
    canonical = canonical_body()
    inline = extract_inline_body()
    if canonical != inline:
        raise SystemExit(
            "Inline gate in codeql-javascript-typescript.yml does not match "
            f"{CANONICAL.relative_to(REPO_ROOT)}; run "
            f"python3 {Path(__file__).relative_to(REPO_ROOT)} --write"
        )


def write_inline_into_workflow() -> None:
    body = _indent_script(canonical_body().rstrip("\n"))
    content = WORKFLOW.read_text(encoding="utf-8")
    pattern = (
        rf"(^[ \t]*python3 <<'{MARKER}'\n)"
        rf".*?"
        rf"(\n[ \t]*{MARKER}[ \t]*\n)"
    )
    def repl(match: re.Match[str]) -> str:
        return match.group(1) + body + match.group(2)

    updated, count = re.subn(
        pattern,
        repl,
        content,
        count=1,
        flags=re.DOTALL | re.MULTILINE,
    )
    if count != 1:
        raise SystemExit("Could not locate inline gate block to update")
    WORKFLOW.write_text(updated, encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} (--check|--write)", file=sys.stderr)
        return 2
    if sys.argv[1] == "--check":
        assert_inline_matches_canonical()
        print("Inline gate matches canonical script.")
        return 0
    if sys.argv[1] == "--write":
        write_inline_into_workflow()
        print(f"Updated inline gate in {WORKFLOW.relative_to(REPO_ROOT)}")
        return 0
    print(f"Unknown option: {sys.argv[1]}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
