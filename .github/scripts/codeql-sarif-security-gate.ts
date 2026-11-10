#!/usr/bin/env node
/** Fail the job when CodeQL SARIF contains security-tagged findings at or above a level. */

import { appendFileSync, globSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LEVEL_RANK: Readonly<Record<string, number>> = {
  none: 0,
  note: 1,
  warning: 2,
  error: 3,
};

type JsonObject = Record<string, unknown>;

function isSecurityRule(rule: JsonObject): boolean {
  const props = (rule.properties ?? {}) as JsonObject;
  const tags = props.tags;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (String(tag).toLowerCase().includes("security")) {
        return true;
      }
    }
  }
  return props["security-severity"] !== undefined && props["security-severity"] !== null;
}

function toolComponents(run: JsonObject): JsonObject[] {
  const tool = (run.tool ?? {}) as JsonObject;
  const driver = (tool.driver ?? {}) as JsonObject;
  const extensions = Array.isArray(tool.extensions)
    ? (tool.extensions as JsonObject[])
    : [];
  return [driver, ...extensions];
}

function resolveRule(run: JsonObject, result: JsonObject): JsonObject {
  const ruleRef = (result.rule ?? {}) as JsonObject;
  const ruleId = (result.ruleId ?? ruleRef.id) as string | undefined;
  if (ruleId) {
    for (const component of toolComponents(run)) {
      const rules = component.rules;
      if (!Array.isArray(rules)) {
        continue;
      }
      for (const rule of rules) {
        if ((rule as JsonObject).id === ruleId) {
          return rule as JsonObject;
        }
      }
    }
  }

  const ruleIndex = ruleRef.index;
  if (ruleIndex === undefined || ruleIndex === null) {
    return {};
  }
  const index = Number(ruleIndex);
  if (!Number.isInteger(index)) {
    return {};
  }

  const tcRef = (ruleRef.toolComponent ?? {}) as JsonObject;
  const components = toolComponents(run);
  const tool = (run.tool ?? {}) as JsonObject;
  const extensions = Array.isArray(tool.extensions)
    ? (tool.extensions as JsonObject[])
    : [];

  const candidates: JsonObject[] = [];
  const tcIndexRaw = tcRef.index;
  if (tcIndexRaw !== undefined && tcIndexRaw !== null) {
    const tcIndex = Number(tcIndexRaw);
    if (Number.isInteger(tcIndex)) {
      if (tcIndex < extensions.length) {
        candidates.push(extensions[tcIndex] as JsonObject);
      }
      if (tcIndex < components.length) {
        candidates.push(components[tcIndex] as JsonObject);
      }
    }
  } else {
    candidates.push(components[0] as JsonObject);
  }

  const seen = new Set<JsonObject>();
  for (const component of candidates) {
    if (component === undefined || seen.has(component)) {
      continue;
    }
    seen.add(component);
    const rules = component.rules;
    if (!Array.isArray(rules)) {
      continue;
    }
    if (index >= 0 && index < rules.length) {
      return rules[index] as JsonObject;
    }
  }
  return {};
}

function resultLevel(result: JsonObject, rule: JsonObject): string {
  const level = result.level;
  if (level !== undefined && level !== null) {
    return String(level).toLowerCase();
  }
  const defaultCfg = (rule.defaultConfiguration ?? {}) as JsonObject;
  const defaultLevel = defaultCfg.level;
  if (defaultLevel !== undefined && defaultLevel !== null) {
    return String(defaultLevel).toLowerCase();
  }
  return "warning";
}

function ruleIdentifier(result: JsonObject, rule: JsonObject): string {
  if (rule.id) {
    return String(rule.id);
  }
  return String(result.ruleId ?? "");
}

interface Finding {
  rule: string;
  level: string;
  file: string;
  line: string;
  message: string;
}

function collectFindings(
  sarifDir: string,
  minRank: number,
): { findings: Finding[]; errors: string[] } {
  const findings: Finding[] = [];
  const errors: string[] = [];
  const paths = globSync("**/*.sarif", { cwd: sarifDir, recursive: true })
    .map((relative) => join(sarifDir, relative))
    .sort();
  if (paths.length === 0) {
    errors.push(`No SARIF files found under ${sarifDir}`);
    return { findings, errors };
  }

  for (const path of paths) {
    let document: JsonObject;
    try {
      const raw = readFileSync(path, { encoding: "utf-8" });
      document = JSON.parse(raw) as JsonObject;
    } catch (exc) {
      errors.push(`Failed to parse SARIF ${path}: ${String(exc)}`);
      continue;
    }

    const runs = document.runs;
    if (!Array.isArray(runs)) {
      continue;
    }
    for (const runEntry of runs) {
      const run = runEntry as JsonObject;
      const results = run.results;
      if (!Array.isArray(results)) {
        continue;
      }
      for (const resultEntry of results) {
        const result = resultEntry as JsonObject;
        const rule = resolveRule(run, result);
        if (!isSecurityRule(rule)) {
          continue;
        }
        const level = resultLevel(result, rule);
        const rank = LEVEL_RANK[level] ?? LEVEL_RANK.warning;
        if (rank < minRank) {
          continue;
        }
        const locations = result.locations;
        const location = (
          Array.isArray(locations) && locations.length > 0 ? locations[0] : {}
        ) as JsonObject;
        const physical = (location.physicalLocation ?? {}) as JsonObject;
        const artifact = (physical.artifactLocation ?? {}) as JsonObject;
        const region = (physical.region ?? {}) as JsonObject;
        const messageObj = (result.message ?? {}) as JsonObject;
        const message = messageObj.text !== undefined && messageObj.text !== null
          ? String(messageObj.text)
          : "";
        findings.push({
          rule: ruleIdentifier(result, rule),
          level,
          file: artifact.uri !== undefined && artifact.uri !== null ? String(artifact.uri) : "",
          line:
            region.startLine !== undefined && region.startLine !== null
              ? String(region.startLine)
              : "",
          message,
        });
      }
    }
  }
  return { findings, errors };
}

function writeSummary(
  findings: Finding[],
  failOn: string,
  errors: string[],
): void {
  const lines: string[] = [
    "## CodeQL security gate (SARIF artifact mode)",
    "",
    `Threshold: security-tagged rules with SARIF level **${failOn}** or higher.`,
    "",
  ];
  if (errors.length > 0) {
    lines.push("**Errors:**");
    for (const err of errors) {
      lines.push(`- ${err}`);
    }
    lines.push("");
  }
  if (findings.length === 0) {
    lines.push("No matching findings.");
  } else {
    lines.push(`**${findings.length}** matching finding(s):`);
    lines.push("");
    lines.push("| Level | Rule | Location | Message |");
    lines.push("| --- | --- | --- | --- |");
    for (const item of findings.slice(0, 50)) {
      const location = item.file ? `${item.file}:${item.line}` : "—";
      const message = item.message.replaceAll("|", "\\|").slice(0, 160);
      lines.push(`| ${item.level} | \`${item.rule}\` | ${location} | ${message} |`);
    }
    if (findings.length > 50) {
      lines.push(`| … | | | (${findings.length - 50} more in SARIF artifact) |`);
    }
  }
  const text = `${lines.join("\n")}\n`;
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, text, { encoding: "utf-8" });
  }
  console.log(text);
}

function main(): number {
  const failOn = (process.env.FAIL_ON_SARIF_LEVEL ?? "error").toLowerCase();
  const minRank = LEVEL_RANK[failOn];
  if (minRank === undefined) {
    console.error(`Invalid FAIL_ON_SARIF_LEVEL: ${JSON.stringify(failOn)}`);
    return 2;
  }
  const sarifDir = process.env.SARIF_DIR ?? "codeql-sarif";
  try {
    if (!statSync(sarifDir).isDirectory()) {
      console.error(`SARIF directory not found: ${sarifDir}`);
      return 2;
    }
  } catch {
    console.error(`SARIF directory not found: ${sarifDir}`);
    return 2;
  }
  const { findings, errors } = collectFindings(sarifDir, minRank);
  writeSummary(findings, failOn, errors);
  if (errors.length > 0) {
    return 2;
  }
  return findings.length > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
