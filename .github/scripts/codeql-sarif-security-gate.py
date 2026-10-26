#!/usr/bin/env python3
"""Fail the job when CodeQL SARIF contains security-tagged findings at or above a level."""

from __future__ import annotations

import glob
import json
import os
import sys
from typing import Any

LEVEL_RANK = {"none": 0, "note": 1, "warning": 2, "error": 3}


def is_security_rule(rule: dict[str, Any]) -> bool:
    props = rule.get("properties") or {}
    tags = [str(tag).lower() for tag in props.get("tags") or []]
    if any("security" in tag for tag in tags):
        return True
    return props.get("security-severity") is not None


def collect_findings(sarif_dir: str, min_rank: int) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for path in glob.glob(os.path.join(sarif_dir, "**", "*.sarif"), recursive=True):
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        for run in document.get("runs", []):
            rules = {
                rule["id"]: rule
                for rule in run.get("tool", {}).get("driver", {}).get("rules", [])
            }
            for result in run.get("results", []):
                rule_id = str(result.get("ruleId", ""))
                rule = rules.get(rule_id, {})
                if not is_security_rule(rule):
                    continue
                level = str(result.get("level") or "warning").lower()
                if LEVEL_RANK.get(level, LEVEL_RANK["warning"]) < min_rank:
                    continue
                location = (result.get("locations") or [{}])[0]
                physical = location.get("physicalLocation") or {}
                artifact = physical.get("artifactLocation") or {}
                region = physical.get("region") or {}
                message = (result.get("message") or {}).get("text") or ""
                findings.append(
                    {
                        "rule": rule_id,
                        "level": level,
                        "file": str(artifact.get("uri") or ""),
                        "line": str(region.get("startLine") or ""),
                        "message": message,
                    }
                )
    return findings


def write_summary(findings: list[dict[str, str]], fail_on: str) -> None:
    lines = [
        "## CodeQL security gate (SARIF artifact mode)",
        "",
        f"Threshold: security-tagged rules with SARIF level **{fail_on}** or higher.",
        "",
    ]
    if not findings:
        lines.append("No matching findings.")
    else:
        lines.append(f"**{len(findings)}** matching finding(s):")
        lines.append("")
        lines.append("| Level | Rule | Location | Message |")
        lines.append("| --- | --- | --- | --- |")
        for item in findings[:50]:
            location = f"{item['file']}:{item['line']}" if item["file"] else "—"
            message = item["message"].replace("|", "\\|")[:160]
            lines.append(
                f"| {item['level']} | `{item['rule']}` | {location} | {message} |"
            )
        if len(findings) > 50:
            lines.append(f"| … | | | ({len(findings) - 50} more in SARIF artifact) |")
    text = "\n".join(lines) + "\n"
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write(text)
    print(text)


def main() -> int:
    fail_on = os.environ.get("FAIL_ON_SARIF_LEVEL", "error").lower()
    min_rank = LEVEL_RANK.get(fail_on)
    if min_rank is None:
        print(f"Invalid FAIL_ON_SARIF_LEVEL: {fail_on!r}", file=sys.stderr)
        return 2
    sarif_dir = os.environ.get("SARIF_DIR", "codeql-sarif")
    if not os.path.isdir(sarif_dir):
        print(f"SARIF directory not found: {sarif_dir}", file=sys.stderr)
        return 2
    findings = collect_findings(sarif_dir, min_rank)
    write_summary(findings, fail_on)
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
