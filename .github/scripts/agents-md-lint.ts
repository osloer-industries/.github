#!/usr/bin/env node
/**
 * Deterministic AGENTS.md quality gate for osloer-industries repositories.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const AGENTS_MD_BASENAME = "AGENTS.md";
export const MAX_LINES = 220;
export const MAX_WORDS = 3500;
export const ORG_BLOCK_START_RE =
  /<!--\s*org-agent-workflow:start\s+(v[\d.]+)\s*-->/u;
export const ORG_BLOCK_END = "<!-- org-agent-workflow:end -->";

export const FILLER_PHRASES: readonly string[] = [
  "best practices",
  "clean code",
  "make sure to",
  "please note",
  "simply",
  "robust",
  "seamless",
];

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

const FORBIDDEN_TRACKED_PATTERNS: readonly RegExp[] = [
  /(^|\/)CLAUDE\.md$/u,
  /^\.cursor\/rules\//u,
  /^\.cursorrules$/u,
  /^\.github\/copilot-instructions\.md$/u,
  /^\.github\/instructions\//u,
  /^GEMINI\.md$/u,
  /^\.windsurfrules$/u,
  /^\.clinerules$/u,
  /^AGENTS\.override\.md$/u,
];

export type FindingSeverity = "error" | "warning";

export interface LintFinding {
  rule: string;
  message: string;
  line?: number;
  severity: FindingSeverity;
}

export interface AgentsMdLintOptions {
  repoRoot: string;
  agentsRelativePath?: string;
  orgWorkflowBlockPath?: string;
  requireOrgWorkflowBlock: boolean;
  maxLines?: number;
  maxWords?: number;
  packageJsonNames?: readonly string[];
  packageJsonError?: string;
}

export interface PackageScriptsResult {
  scriptNames: readonly string[];
  errorFinding: LintFinding | null;
  citedWithoutManifest: boolean;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/u).length;
}

export function loadAgentsMd(repoRoot: string, relativePath = AGENTS_MD_BASENAME): string {
  const fullPath = resolve(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing ${relativePath} at ${fullPath}`);
  }
  return readFileSync(fullPath, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePackageScripts(packagePath: string): PackageScriptsResult {
  if (!existsSync(packagePath)) {
    return { scriptNames: [], errorFinding: null, citedWithoutManifest: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      scriptNames: [],
      errorFinding: {
        rule: "package-json-invalid",
        message: `Invalid package.json at ${packagePath}: ${message}`,
        severity: "error",
      },
      citedWithoutManifest: false,
    };
  }
  if (!isRecord(parsed)) {
    return {
      scriptNames: [],
      errorFinding: {
        rule: "package-json-invalid",
        message: `package.json at ${packagePath} must be a JSON object`,
        severity: "error",
      },
      citedWithoutManifest: false,
    };
  }
  const scripts = parsed.scripts;
  if (scripts === undefined) {
    return { scriptNames: [], errorFinding: null, citedWithoutManifest: false };
  }
  if (!isRecord(scripts)) {
    return {
      scriptNames: [],
      errorFinding: {
        rule: "package-json-invalid",
        message: `package.json "scripts" must be an object`,
        severity: "error",
      },
      citedWithoutManifest: false,
    };
  }
  return {
    scriptNames: Object.keys(scripts),
    errorFinding: null,
    citedWithoutManifest: false,
  };
}

export function resolvePackageJsonPath(repoRoot: string, agentsRelativePath: string): string {
  const agentsDir = dirname(agentsRelativePath);
  const nested = join(repoRoot, agentsDir, "package.json");
  if (existsSync(nested)) {
    return nested;
  }
  return join(repoRoot, "package.json");
}

export function findingsForSize(
  content: string,
  maxLines: number,
  maxWords: number,
): LintFinding[] {
  const lines = content.split("\n");
  const findings: LintFinding[] = [];
  if (lines.length > maxLines) {
    findings.push({
      rule: "size-lines",
      message: `AGENTS.md has ${lines.length} lines (budget ${maxLines})`,
      severity: "error",
    });
  }
  const words = countWords(content);
  if (words > maxWords) {
    findings.push({
      rule: "size-words",
      message: `AGENTS.md has ${words} words (budget ${maxWords})`,
      severity: "error",
    });
  }
  return findings;
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export function stripCodeForProseScan(content: string): string {
  let out = content.replaceAll("\r\n", "\n");
  out = out.replace(/```[\s\S]*?```/g, " ");
  out = out.replace(/`[^`\n]+`/g, " ");
  return out;
}

export function findingsForFiller(content: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const prose = stripCodeForProseScan(content);
  for (const phrase of FILLER_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "giu");
    for (const match of prose.matchAll(re)) {
      if (match.index === undefined) {
        continue;
      }
      findings.push({
        rule: "filler-phrase",
        message: `Banned filler phrase ${JSON.stringify(phrase)}`,
        line: lineNumberAt(content, match.index),
        severity: "warning",
      });
    }
  }
  for (const match of content.matchAll(EMOJI_RE)) {
    if (match.index === undefined) {
      continue;
    }
    findings.push({
      rule: "emoji",
      message: "Emoji are not allowed in AGENTS.md",
      line: lineNumberAt(content, match.index),
      severity: "error",
    });
  }
  return findings;
}

function isScriptToken(token: string): boolean {
  if (token.length === 0) {
    return false;
  }
  if (token.includes("/")) {
    return false;
  }
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/iu.test(token)) {
    return false;
  }
  return true;
}

const SCRIPT_PATTERNS: readonly { re: RegExp; label: string }[] = [
  { re: /(?:^|[^\w])npm\s+run\s+([^\s`]+)/gu, label: "npm run" },
  { re: /(?:^|[^\w])npm\s+run-script\s+([^\s`]+)/gu, label: "npm run-script" },
  { re: /(?:^|[^\w])npm\s+test\b/gu, label: "npm test" },
  { re: /(?:^|[^\w])bun\s+run\s+([^\s`]+)/gu, label: "bun run" },
  { re: /(?:^|[^\w])pnpm\s+run\s+([^\s`]+)/gu, label: "pnpm run" },
  {
    re: /(?:^|[^\w])yarn\s+(?!add|install|remove|upgrade|workspace|dlx|set|config)([a-zA-Z0-9:_-]+)/gu,
    label: "yarn",
  },
];

export function findingsForPackageScripts(
  content: string,
  pkg: PackageScriptsResult,
  hasPackageJson: boolean,
): LintFinding[] {
  const findings: LintFinding[] = [];
  if (pkg.errorFinding) {
    findings.push(pkg.errorFinding);
  }
  const known = new Set(pkg.scriptNames);
  for (const { re, label } of SCRIPT_PATTERNS) {
    re.lastIndex = 0;
    for (const match of content.matchAll(re)) {
      const script =
        label === "npm test" ? "test" : (match[1] ?? "");
      if (!isScriptToken(script)) {
        continue;
      }
      if (!hasPackageJson && !pkg.errorFinding) {
        findings.push({
          rule: "npm-script",
          message: `${label} cites ${JSON.stringify(script)} but no package.json is available`,
          line: lineNumberAt(content, match.index),
          severity: "error",
        });
        continue;
      }
      if (pkg.errorFinding) {
        continue;
      }
      if (known.size === 0) {
        findings.push({
          rule: "npm-script",
          message: `${label} cites ${JSON.stringify(script)} but package.json has no scripts`,
          line: lineNumberAt(content, match.index),
          severity: "error",
        });
        continue;
      }
      if (!known.has(script)) {
        findings.push({
          rule: "npm-script",
          message: `${label} references missing package.json script ${JSON.stringify(script)}`,
          line: lineNumberAt(content, match.index),
          severity: "error",
        });
      }
    }
  }
  return findings;
}

export function normalizePathToken(token: string): string {
  let t = token.trim();
  const colon = t.indexOf(":");
  if (colon > 0 && /^\d+$/.test(t.slice(colon + 1))) {
    t = t.slice(0, colon);
  }
  return t;
}

const SYMBOLIC_FILENAMES = new Set(["CLAUDE.md", "AGENTS.md"]);

function isBareExtensionLiteral(t: string): boolean {
  return /^\.[a-z0-9]+$/iu.test(t);
}

function isExternalUiPath(t: string): boolean {
  return /^\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(t);
}

function isDocumentationAgentPath(rel: string): boolean {
  if (rel.endsWith("/")) {
    return true;
  }
  for (const re of FORBIDDEN_TRACKED_PATTERNS) {
    if (re.test(rel)) {
      return true;
    }
  }
  if (rel.startsWith(".claude/") || rel.startsWith(".agents/skills/")) {
    return true;
  }
  if (rel === ".github/agent-files.allow") {
    return true;
  }
  return false;
}

export function looksLikeRepoPath(token: string): boolean {
  const t = normalizePathToken(token);
  if (t.length === 0 || t.length > 260) {
    return false;
  }
  if (isBareExtensionLiteral(t) || isExternalUiPath(t) || t === "/") {
    return false;
  }
  if (/^https?:\/\//i.test(t) || t.includes(" ")) {
    return false;
  }
  if (t.includes("~") || t.includes("<") || t.includes(":") || t.includes("*")) {
    return false;
  }
  if (t.startsWith("@")) {
    return false;
  }
  if (/^(npm|bun|node|git|gh)\s/i.test(t)) {
    return false;
  }
  if (SYMBOLIC_FILENAMES.has(t)) {
    return false;
  }
  if (t.startsWith("/") || t.startsWith("..")) {
    return true;
  }
  if (
    !t.startsWith(".") &&
    (/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(t) || /^[A-Za-z0-9_-]+\/\.github$/u.test(t))
  ) {
    return false;
  }
  if (!t.includes("/") && !t.startsWith(".")) {
    return false;
  }
  return true;
}

export function staticGlobPrefix(token: string): string {
  const idx = token.indexOf("*");
  if (idx < 0) {
    return token;
  }
  return token.slice(0, idx);
}

const BACKTICK_RE = /`([^`\n]+)`/g;

export function extractBacktickPaths(content: string): { path: string; index: number }[] {
  const paths: { path: string; index: number }[] = [];
  BACKTICK_RE.lastIndex = 0;
  for (const match of content.matchAll(BACKTICK_RE)) {
    const raw = match[1] ?? "";
    const token = normalizePathToken(raw);
    const checkPath = token.includes("*") ? staticGlobPrefix(token) : token;
    if (looksLikeRepoPath(checkPath)) {
      paths.push({ path: checkPath, index: match.index ?? 0 });
    }
  }
  return paths;
}

export function findingsForRepoPaths(
  content: string,
  repoRoot: string,
  agentsRelativePath: string,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const agentsDir = dirname(agentsRelativePath);
  const bases = [
    resolve(repoRoot, agentsDir),
    resolve(repoRoot),
  ];
  for (const { path: rel, index } of extractBacktickPaths(content)) {
    if (rel.startsWith("/") || rel.startsWith("..")) {
      findings.push({
        rule: "repo-path",
        message: `Backtick path must be repo-relative: ${JSON.stringify(rel)}`,
        line: lineNumberAt(content, index),
        severity: "error",
      });
      continue;
    }
    let exists = false;
    for (const base of bases) {
      const full = resolve(base, rel);
      if (!full.startsWith(repoRoot)) {
        continue;
      }
      if (existsSync(full)) {
        exists = true;
        break;
      }
    }
    if (!exists && !isDocumentationAgentPath(rel)) {
      findings.push({
        rule: "repo-path",
        message: `Backtick path does not exist: ${JSON.stringify(rel)}`,
        line: lineNumberAt(content, index),
        severity: "error",
      });
    }
  }
  return findings;
}

export function normalizeOrgBlockWhitespace(text: string): string {
  const lines = text.replaceAll("\r\n", "\n").split("\n").map((line) => line.trimEnd());
  const out: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.length === 0) {
      blankRun += 1;
      if (blankRun <= 1) {
        out.push("");
      }
      continue;
    }
    blankRun = 0;
    out.push(line);
  }
  return out.join("\n").trim();
}

export interface OrgBlockRegion {
  version: string;
  body: string;
}

export function extractOrgBlockRegion(content: string): OrgBlockRegion | null {
  const normalized = content.replaceAll("\r\n", "\n");
  const startMatch = normalized.match(ORG_BLOCK_START_RE);
  if (!startMatch || startMatch.index === undefined) {
    return null;
  }
  const version = startMatch[1] ?? "";
  const startIdx = startMatch.index + startMatch[0].length;
  const endIdx = normalized.indexOf(ORG_BLOCK_END, startIdx);
  if (endIdx < 0) {
    return null;
  }
  const body = normalized.slice(startIdx, endIdx).trim();
  return { version, body };
}

export function parseCanonicalOrgBlock(raw: string): {
  version: string;
  body: string;
} {
  const trimmed = raw.replaceAll("\r\n", "\n").trim();
  if (trimmed.length === 0) {
    throw new Error("Canonical org workflow block is empty");
  }
  const region = extractOrgBlockRegion(trimmed);
  if (region) {
    return region;
  }
  const startMatch = trimmed.match(ORG_BLOCK_START_RE);
  const version = startMatch?.[1] ?? "unknown";
  return { version, body: trimmed };
}

export function unifiedDiffLines(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const out: string[] = ["--- AGENTS.md (embedded)", "+++ canonical"];
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i += 1) {
    const left = aLines[i] ?? "";
    const right = bLines[i] ?? "";
    if (left !== right) {
      if (i < aLines.length) {
        out.push(`-${left}`);
      }
      if (i < bLines.length) {
        out.push(`+${right}`);
      }
    }
  }
  return out.join("\n");
}

export function findingsForOrgWorkflowBlock(
  content: string,
  canonicalRaw: string,
): LintFinding[] {
  let canonical: { version: string; body: string };
  try {
    canonical = parseCanonicalOrgBlock(canonicalRaw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      {
        rule: "org-workflow-block-missing",
        message: message,
        severity: "error",
      },
    ];
  }
  const embedded = extractOrgBlockRegion(content);
  if (!embedded) {
    return [
      {
        rule: "org-workflow-block-markers",
        message:
          "AGENTS.md must wrap the org Agent workflow section in org-agent-workflow start/end markers",
        severity: "error",
      },
    ];
  }
  const normEmbedded = normalizeOrgBlockWhitespace(embedded.body);
  const normCanonical = normalizeOrgBlockWhitespace(canonical.body);
  if (normEmbedded === normCanonical) {
    if (embedded.version !== canonical.version) {
      return [
        {
          rule: "org-workflow-block-version",
          message: `Update marker version from ${embedded.version} to ${canonical.version} (content already matches)`,
          severity: "error",
        },
      ];
    }
    return [];
  }
  const diff = unifiedDiffLines(normEmbedded, normCanonical);
  const versionNote =
    embedded.version !== canonical.version
      ? ` (embedded ${embedded.version}, canonical ${canonical.version})`
      : "";
  return [
    {
      rule: "org-workflow-block",
      message: `Org Agent workflow block drift${versionNote}. Sync markers and content. Diff:\n${diff}`,
      severity: "error",
    },
  ];
}

export function listTrackedFiles(repoRoot: string): string[] {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return output.split("\0").filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

export function findingsForForbiddenAgentFiles(repoRoot: string): LintFinding[] {
  const tracked = listTrackedFiles(repoRoot);
  const findings: LintFinding[] = [];
  for (const path of tracked) {
    if (FORBIDDEN_TRACKED_PATTERNS.some((re) => re.test(path))) {
      findings.push({
        rule: "forbidden-agent-file",
        message: `Tracked forbidden agent instruction file: ${JSON.stringify(path)}`,
        severity: "error",
      });
    }
  }
  return findings;
}

function loadCanonicalBlock(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`Missing canonical org workflow block at ${path}`);
  }
  const raw = readFileSync(path, "utf8");
  if (raw.trim().length === 0) {
    throw new Error(`Canonical org workflow block at ${path} is empty`);
  }
  return raw;
}

export function lintAgentsMd(options: AgentsMdLintOptions): LintFinding[] {
  const agentsPath = options.agentsRelativePath ?? AGENTS_MD_BASENAME;
  const content = loadAgentsMd(options.repoRoot, agentsPath);
  const maxLines = options.maxLines ?? MAX_LINES;
  const maxWords = options.maxWords ?? MAX_WORDS;

  const packagePath = resolvePackageJsonPath(options.repoRoot, agentsPath);
  const hasPackageJson = existsSync(packagePath);
  const pkg =
    options.packageJsonNames !== undefined
      ? {
          scriptNames: options.packageJsonNames,
          errorFinding: options.packageJsonError
            ? {
                rule: "package-json-invalid",
                message: options.packageJsonError,
                severity: "error" as const,
              }
            : null,
          citedWithoutManifest: false,
        }
      : parsePackageScripts(packagePath);

  const findings: LintFinding[] = [
    ...findingsForSize(content, maxLines, maxWords),
    ...findingsForFiller(content),
    ...findingsForPackageScripts(content, pkg, hasPackageJson),
    ...findingsForRepoPaths(content, options.repoRoot, agentsPath),
    ...findingsForForbiddenAgentFiles(options.repoRoot),
  ];

  if (options.requireOrgWorkflowBlock) {
    const blockPath =
      options.orgWorkflowBlockPath ??
      join(options.repoRoot, ".github", "agents-org-workflow-block.md");
    try {
      const canonical = loadCanonicalBlock(blockPath);
      findings.push(...findingsForOrgWorkflowBlock(content, canonical));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      findings.push({
        rule: "org-workflow-block-missing",
        message,
        severity: "error",
      });
    }
  }

  return findings;
}

function escapeWorkflowMessage(message: string): string {
  return message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

export function formatFinding(
  finding: LintFinding,
  agentsRelativePath: string,
): string {
  const level = finding.severity === "warning" ? "warning" : "error";
  const location =
    finding.line === undefined
      ? ` file=${agentsRelativePath}`
      : ` file=${agentsRelativePath},line=${finding.line}`;
  return `::${level}${location}::[agents-md:${finding.rule}] ${escapeWorkflowMessage(finding.message)}`;
}

export function reportFindings(
  findings: readonly LintFinding[],
  agentsRelativePath: string,
): void {
  for (const finding of findings) {
    const line = formatFinding(finding, agentsRelativePath);
    if (finding.severity === "warning") {
      console.warn(line);
    } else {
      console.error(line);
    }
  }
}

export function resolveRepoRoot(explicit: string | undefined, moduleUrl: string): string {
  const trimmed = explicit?.trim();
  if (trimmed && trimmed.length > 0) {
    return resolve(trimmed);
  }
  const scriptDir = fileURLToPath(new URL(".", moduleUrl));
  if (scriptDir.replaceAll("\\", "/").endsWith("/.github/scripts")) {
    return resolve(scriptDir, "../..");
  }
  throw new Error(
    "Could not resolve repository root. Set AGENTS_MD_REPO_ROOT when the script is vendored from osloer-industries/.github.",
  );
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim().length === 0) {
    return defaultValue;
  }
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") {
    return true;
  }
  if (v === "false" || v === "0" || v === "no") {
    return false;
  }
  return defaultValue;
}

export function runAgentsMdLintCli(moduleUrl: string): number {
  const repoRoot = resolveRepoRoot(process.env.AGENTS_MD_REPO_ROOT, moduleUrl);
  const agentsRelative = process.env.AGENTS_MD_PATH?.trim() || AGENTS_MD_BASENAME;
  const orgBlockPath =
    process.env.AGENTS_MD_ORG_BLOCK_PATH?.trim() ||
    join(repoRoot, ".github", "agents-org-workflow-block.md");
  const requireBlock = parseBoolean(process.env.AGENTS_MD_REQUIRE_ORG_BLOCK, true);
  const maxLines = Number(process.env.AGENTS_MD_MAX_LINES ?? String(MAX_LINES));
  const maxWords = Number(process.env.AGENTS_MD_MAX_WORDS ?? String(MAX_WORDS));

  const findings = lintAgentsMd({
    repoRoot,
    agentsRelativePath: agentsRelative,
    orgWorkflowBlockPath: orgBlockPath,
    requireOrgWorkflowBlock: requireBlock,
    maxLines: Number.isFinite(maxLines) ? maxLines : MAX_LINES,
    maxWords: Number.isFinite(maxWords) ? maxWords : MAX_WORDS,
  });

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  if (findings.length === 0) {
    console.log(`${basename(agentsRelative)} passed agents-md lint.`);
    return 0;
  }
  reportFindings(findings, agentsRelative);
  if (errors.length > 0) {
    console.error(
      `agents-md lint failed with ${errors.length} error(s) and ${warnings.length} warning(s).`,
    );
    return 1;
  }
  console.log(`agents-md lint passed with ${warnings.length} warning(s).`);
  return 0;
}

function isDirectExecution(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (argvEntry === undefined) {
    return false;
  }
  return moduleUrl === pathToFileURL(resolve(argvEntry)).href;
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  process.exit(runAgentsMdLintCli(import.meta.url));
}