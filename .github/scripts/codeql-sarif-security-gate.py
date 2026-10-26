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


def tool_components(run: dict[str, Any]) -> list[dict[str, Any]]:
    tool = run.get("tool") or {}
    driver = tool.get("driver") or {}
    extensions = list(tool.get("extensions") or [])
    return [driver, *extensions]


def resolve_rule(run: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    rule_ref = result.get("rule") or {}
    rule_id = result.get("ruleId") or rule_ref.get("id")
    if rule_id:
        for component in tool_components(run):
            for rule in component.get("rules") or []:
                if rule.get("id") == rule_id:
                    return rule

    rule_index = rule_ref.get("index")
    if rule_index is None:
        return {}

    tc_ref = rule_ref.get("toolComponent") or {}
    components = tool_components(run)
    extensions = (run.get("tool") or {}).get("extensions") or []

    candidates: list[dict[str, Any]] = []
    tc_index = tc_ref.get("index")
    if tc_index is not None:
        if tc_index < len(extensions):
            candidates.append(extensions[tc_index])
        if tc_index < len(components):
            candidates.append(components[tc_index])
    else:
        candidates.append(components[0])

    seen: set[int] = set()
    for component in candidates:
        ident = id(component)
        if ident in seen:
            continue
        seen.add(ident)
        rules = component.get("rules") or []
        if 0 <= rule_index < len(rules):
            return rules[rule_index]
    return {}


def result_level(result: dict[str, Any], rule: dict[str, Any]) -> str:
    level = result.get("level")
    if level is not None:
        return str(level).lower()
    default_cfg = rule.get("defaultConfiguration") or {}
    default_level = default_cfg.get("level")
    if default_level is not None:
        return str(default_level).lower()
    return "warning"


def rule_identifier(result: dict[str, Any], rule: dict[str, Any]) -> str:
    if rule.get("id"):
        return str(rule["id"])
    return str(result.get("ruleId") or "")


def collect_findings(sarif_dir: str, min_rank: int) -> tuple[list[dict[str, str]], list[str]]:
    findings: list[dict[str, str]] = []
    errors: list[str] = []
    paths = sorted(glob.glob(os.path.join(sarif_dir, "**", "*.sarif"), recursive=True))
    if not paths:
        errors.append(f"No SARIF files found under {sarif_dir}")
        return findings, errors

    for path in paths:
        try:
            with open(path, encoding="utf-8") as handle:
                document = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"Failed to parse SARIF {path}: {exc}")
            continue

        for run in document.get("runs", []):
            for result in run.get("results", []):
                rule = resolve_rule(run, result)
                if not is_security_rule(rule):
                    continue
                level = result_level(result, rule)
                if LEVEL_RANK.get(level, LEVEL_RANK["warning"]) < min_rank:
                    continue
                location = (result.get("locations") or [{}])[0]
                physical = location.get("physicalLocation") or {}
                artifact = physical.get("artifactLocation") or {}
                region = physical.get("region") or {}
                message = (result.get("message") or {}).get("text") or ""
                findings.append(
                    {
                        "rule": rule_identifier(result, rule),
                        "level": level,
                        "file": str(artifact.get("uri") or ""),
                        "line": str(region.get("startLine") or ""),
                        "message": message,
                    }
                )
    return findings, errors


def write_summary(
    findings: list[dict[str, str]], fail_on: str, errors: list[str]
) -> None:
    lines = [
        "## CodeQL security gate (SARIF artifact mode)",
        "",
        f"Threshold: security-tagged rules with SARIF level **{fail_on}** or higher.",
        "",
    ]
    if errors:
        lines.append("**Errors:**")
        for err in errors:
            lines.append(f"- {err}")
        lines.append("")
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
    findings, errors = collect_findings(sarif_dir, min_rank)
    write_summary(findings, fail_on, errors)
    if errors:
        return 2
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
