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

function jsonString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function isSecurityRule(rule: JsonObject): boolean {
  const props = (rule.properties ?? {}) as JsonObject;
  const tags = props.tags;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (jsonString(tag).toLowerCase().includes("security")) {
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

function findRuleById(run: JsonObject, ruleId: string): JsonObject | null {
  for (const component of toolComponents(run)) {
    const rules = component.rules;
    if (!Array.isArray(rules)) {
      continue;
    }
    for (const rule of rules) {
      if (jsonString((rule as JsonObject).id) === ruleId) {
        return rule as JsonObject;
      }
    }
  }
  return null;
}

function ruleFromIndex(components: JsonObject[], index: number): JsonObject {
  for (const component of components) {
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

function componentsForRuleRef(
  run: JsonObject,
  tcRef: JsonObject,
): JsonObject[] {
  const components = toolComponents(run);
  const tool = (run.tool ?? {}) as JsonObject;
  const extensions = Array.isArray(tool.extensions)
    ? (tool.extensions as JsonObject[])
    : [];
  const tcIndexRaw = tcRef.index;
  if (tcIndexRaw === undefined || tcIndexRaw === null) {
    return components.length > 0 ? [components[0] as JsonObject] : [];
  }
  const tcIndex = Number(tcIndexRaw);
  if (!Number.isInteger(tcIndex)) {
    return [];
  }
  const candidates: JsonObject[] = [];
  if (tcIndex < extensions.length) {
    candidates.push(extensions[tcIndex] as JsonObject);
  }
  if (tcIndex < components.length) {
    candidates.push(components[tcIndex] as JsonObject);
  }
  return candidates;
}

function findRuleByIndex(run: JsonObject, ruleRef: JsonObject): JsonObject {
  const ruleIndex = ruleRef.index;
  if (ruleIndex === undefined || ruleIndex === null) {
    return {};
  }
  const index = Number(ruleIndex);
  if (!Number.isInteger(index)) {
    return {};
  }
  const tcRef = (ruleRef.toolComponent ?? {}) as JsonObject;
  const candidates = componentsForRuleRef(run, tcRef);
  const seen = new Set<JsonObject>();
  for (const component of candidates) {
    if (seen.has(component)) {
      continue;
    }
    seen.add(component);
    const match = ruleFromIndex([component], index);
    if (Object.keys(match).length > 0) {
      return match;
    }
  }
  return {};
}

function resolveRule(run: JsonObject, result: JsonObject): JsonObject {
  const ruleRef = (result.rule ?? {}) as JsonObject;
  const ruleIdRaw = result.ruleId ?? ruleRef.id;
  const ruleId = jsonString(ruleIdRaw);
  if (ruleId) {
    const byId = findRuleById(run, ruleId);
    if (byId !== null) {
      return byId;
    }
  }
  return findRuleByIndex(run, ruleRef);
}

function resultLevel(result: JsonObject, rule: JsonObject): string {
  const level = result.level;
  if (level !== undefined && level !== null) {
    return jsonString(level).toLowerCase();
  }
  const defaultCfg = (rule.defaultConfiguration ?? {}) as JsonObject;
  const defaultLevel = defaultCfg.level;
  if (defaultLevel !== undefined && defaultLevel !== null) {
    return jsonString(defaultLevel).toLowerCase();
  }
  return "warning";
}

function ruleIdentifier(result: JsonObject, rule: JsonObject): string {
  const ruleId = jsonString(rule.id);
  if (ruleId) {
    return ruleId;
  }
  return jsonString(result.ruleId);
}

interface Finding {
  rule: string;
  level: string;
  file: string;
  line: string;
  message: string;
}

function locationFromResult(result: JsonObject): { file: string; line: string; message: string } {
  const locations = result.locations;
  const location = (
    Array.isArray(locations) && locations.length > 0 ? locations[0] : {}
  ) as JsonObject;
  const physical = (location.physicalLocation ?? {}) as JsonObject;
  const artifact = (physical.artifactLocation ?? {}) as JsonObject;
  const region = (physical.region ?? {}) as JsonObject;
  const messageObj = (result.message ?? {}) as JsonObject;
  const message =
    messageObj.text !== undefined && messageObj.text !== null
      ? jsonString(messageObj.text)
      : "";
  const file =
    artifact.uri !== undefined && artifact.uri !== null ? jsonString(artifact.uri) : "";
  const line =
    region.startLine !== undefined && region.startLine !== null
      ? jsonString(region.startLine)
      : "";
  return { file, line, message };
}

function findingFromResult(
  run: JsonObject,
  result: JsonObject,
  minRank: number,
): Finding | null {
  const rule = resolveRule(run, result);
  if (!isSecurityRule(rule)) {
    return null;
  }
  const level = resultLevel(result, rule);
  const rank = LEVEL_RANK[level] ?? LEVEL_RANK.warning;
  if (rank < minRank) {
    return null;
  }
  const { file, line, message } = locationFromResult(result);
  return {
    rule: ruleIdentifier(result, rule),
    level,
    file,
    line,
    message,
  };
}

function parseSarifDocument(path: string): { document: JsonObject | null; error: string | null } {
  try {
    const raw = readFileSync(path, { encoding: "utf-8" });
    return { document: JSON.parse(raw) as JsonObject, error: null };
  } catch (error_: unknown) {
    const detail = error_ instanceof Error ? error_.message : jsonString(error_);
    return { document: null, error: `Failed to parse SARIF ${path}: ${detail}` };
  }
}

function findingsInRun(run: JsonObject, minRank: number): Finding[] {
  const results = run.results;
  if (!Array.isArray(results)) {
    return [];
  }
  const findings: Finding[] = [];
  for (const resultEntry of results) {
    const finding = findingFromResult(run, resultEntry as JsonObject, minRank);
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return findings;
}

function collectFindings(
  sarifDir: string,
  minRank: number,
): { findings: Finding[]; errors: string[] } {
  const findings: Finding[] = [];
  const errors: string[] = [];
  const paths = globSync("**/*.sarif", { cwd: sarifDir, recursive: true })
    .map((relative) => join(sarifDir, relative))
    .toSorted();
  if (paths.length === 0) {
    errors.push(`No SARIF files found under ${sarifDir}`);
    return { findings, errors };
  }

  for (const path of paths) {
    const { document, error } = parseSarifDocument(path);
    if (error !== null) {
      errors.push(error);
      continue;
    }
    if (document === null) {
      continue;
    }
    const runs = document.runs;
    if (!Array.isArray(runs)) {
      continue;
    }
    for (const runEntry of runs) {
      findings.push(...findingsInRun(runEntry as JsonObject, minRank));
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
    lines.push(
      `**${findings.length}** matching finding(s):`,
      "",
      "| Level | Rule | Location | Message |",
      "| --- | --- | --- | --- |",
    );
    const pipeEscape = String.raw`\|`;
    for (const item of findings.slice(0, 50)) {
      const location = item.file ? `${item.file}:${item.line}` : "—";
      const message = item.message.replaceAll("|", pipeEscape).slice(0, 160);
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

export {
  collectFindings,
  findingFromResult,
  isSecurityRule,
  jsonString,
  resolveRule,
  resultLevel,
  ruleIdentifier,
};