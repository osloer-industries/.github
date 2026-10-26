#!/usr/bin/env python3
"""CI tests for codeql-sarif-security-gate.py."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SHIPPED_GATE = REPO_ROOT / ".github/scripts/run_shipped_codeql_gate.py"
FIXTURES = REPO_ROOT / ".github/test-fixtures/codeql-sarif"


def run_gate(sarif_dir: Path, fail_on: str = "error") -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["SARIF_DIR"] = str(sarif_dir)
    env["FAIL_ON_SARIF_LEVEL"] = fail_on
    env.pop("GITHUB_STEP_SUMMARY", None)
    return subprocess.run(
        [sys.executable, str(SHIPPED_GATE)],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


class CodeqlSarifSecurityGateTests(unittest.TestCase):
    def test_security_extension_error_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copy(
                FIXTURES / "security-extension-error.sarif",
                Path(tmp) / "codeql.sarif",
            )
            result = run_gate(Path(tmp))
            self.assertEqual(result.returncode, 1, msg=result.stdout + result.stderr)

    def test_non_security_note_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copy(
                FIXTURES / "non-security-note.sarif",
                Path(tmp) / "codeql.sarif",
            )
            result = run_gate(Path(tmp))
            self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)

    def test_missing_level_uses_rule_default_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copy(
                FIXTURES / "missing-level-rule-default-error.sarif",
                Path(tmp) / "codeql.sarif",
            )
            result = run_gate(Path(tmp))
            self.assertEqual(result.returncode, 1, msg=result.stdout + result.stderr)

    def test_no_sarif_files_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = run_gate(Path(tmp))
            self.assertEqual(result.returncode, 2, msg=result.stdout + result.stderr)

    def test_invalid_sarif_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copy(FIXTURES / "invalid.sarif", Path(tmp) / "broken.sarif")
            result = run_gate(Path(tmp))
            self.assertEqual(result.returncode, 2, msg=result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
