#!/usr/bin/env node
/**
 * Deterministic AGENTS.md quality gate for osloer-industries repositories.
 * Markdown syntax is enforced separately via markdownlint-cli2 in the reusable workflow.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const AGENTS_MD_BASENAME = "AGENTS.md";
export const MAX_LINES = 220;
export const MAX_WORDS = 3500;

export const FILLER_PHRASES: readonly string[] = [
  "best practices",
  "clean code",
  "make sure to",
  "please note",
  "simply",
  "robust",
  "seamless",
];

const EMOJI_RE = /\p{Extended_Pictographic}/u;

const NPM_RUN_RE =
  /(?:^|[^\w])npm\s+run\s+([a-zA-Z0-9:_-]+)/g;
const BUN_RUN_RE =
  /(?:^|[^\w])bun\s+run\s+([a-zA-Z0-9:_-]+)/g;

const BACKTICK_RE = /`([^`\n]+)`/g;

export interface LintFinding {
  rule: string;
  message: string;
  line?: number;
}

export interface AgentsMdLintOptions {
  repoRoot: string;
  agentsRelativePath?: string;
  orgWorkflowBlockPath?: string;
  requireOrgWorkflowBlock: boolean;
  maxLines?: number;
  maxWords?: number;
  packageJsonNames?: readonly string[];
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
    });
  }
  const words = countWords(content);
  if (words > maxWords) {
    findings.push({
      rule: "size-words",
      message: `AGENTS.md has ${words} words (budget ${maxWords})`,
    });
  }
  return findings;
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export function findingsForFiller(content: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const lower = content.toLowerCase();
  for (const phrase of FILLER_PHRASES) {
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const found = lower.indexOf(phrase, searchFrom);
      if (found < 0) {
        break;
      }
      findings.push({
        rule: "filler-phrase",
        message: `Banned filler phrase ${JSON.stringify(phrase)}`,
        line: lineNumberAt(content, found),
      });
      searchFrom = found + phrase.length;
    }
  }
  let emojiFrom = 0;
  while (emojiFrom < content.length) {
    const slice = content.slice(emojiFrom);
    const match = EMOJI_RE.exec(slice);
    if (match?.index === undefined) {
      break;
    }
    const index = emojiFrom + match.index;
    findings.push({
      rule: "emoji",
      message: "Emoji are not allowed in AGENTS.md",
      line: lineNumberAt(content, index),
    });
    emojiFrom = index + match[0].length;
  }
  return findings;
}

export function readPackageScriptNames(repoRoot: string): string[] {
  const packagePath = join(repoRoot, "package.json");
  if (!existsSync(packagePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    return Object.keys(parsed.scripts ?? {});
  } catch {
    return [];
  }
}

export function findingsForNpmScripts(
  content: string,
  scriptNames: readonly string[],
): LintFinding[] {
  const findings: LintFinding[] = [];
  const known = new Set(scriptNames);
  const checkPattern = (re: RegExp, label: string) => {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const script = match[1] ?? "";
      if (script.length === 0) {
        continue;
      }
      if (known.size > 0 && !known.has(script)) {
        findings.push({
          rule: "npm-script",
          message: `${label} references missing package.json script ${JSON.stringify(script)}`,
          line: lineNumberAt(content, match.index),
        });
      }
    }
  };
  checkPattern(NPM_RUN_RE, "npm run");
  checkPattern(BUN_RUN_RE, "bun run");
  return findings;
}

const SYMBOLIC_FILENAMES = new Set(["CLAUDE.md", "AGENTS.md"]);

export function looksLikeRepoPath(token: string): boolean {
  const t = token.trim();
  if (t.length === 0 || t.length > 260) {
    return false;
  }
  if (/^https?:\/\//i.test(t) || t.includes(" ")) {
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
  // Remote org/repo shorthand (e.g. owner/repo or org/.github), not a workspace path.
  if (
    !t.startsWith(".") &&
    (/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(t) || /^[A-Za-z0-9_-]+\/\.github$/u.test(t))
  ) {
    return false;
  }
  return t.includes("/") || t.startsWith(".");
}

export function extractBacktickPaths(content: string): { path: string; index: number }[] {
  const paths: { path: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  BACKTICK_RE.lastIndex = 0;
  while ((match = BACKTICK_RE.exec(content)) !== null) {
    const token = match[1] ?? "";
    if (looksLikeRepoPath(token)) {
      paths.push({ path: token, index: match.index });
    }
  }
  return paths;
}

export function findingsForRepoPaths(
  content: string,
  repoRoot: string,
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const { path: rel, index } of extractBacktickPaths(content)) {
    const full = resolve(repoRoot, rel);
    if (!existsSync(full)) {
      findings.push({
        rule: "repo-path",
        message: `Backtick path does not exist: ${JSON.stringify(rel)}`,
        line: lineNumberAt(content, index),
      });
    }
  }
  return findings;
}

export function findingsForRequiredCheckNaming(content: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!/required/i.test(line) || !/check|status/i.test(line)) {
      continue;
    }
    if (!/only|sole|single|branch protection|ruleset/i.test(line)) {
      continue;
    }
    const names = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
    const wrong = names.filter(
      (n) =>
        n !== "ci-passed" &&
        /^\w[\w -]{0,60}$/u.test(n) &&
        !n.includes("/") &&
        !/\b(run|merge|push)\b/i.test(n),
    );
    for (const name of wrong) {
      findings.push({
        rule: "required-check-name",
        message: `Required status check must be \`ci-passed\`, not ${JSON.stringify(name)}`,
        line: i + 1,
      });
    }
  }
  return findings;
}

export function findingsForOrgWorkflowBlock(
  content: string,
  canonicalBlock: string,
): LintFinding[] {
  if (canonicalBlock.length === 0) {
    return [];
  }
  const normalizedContent = content.replaceAll("\r\n", "\n");
  const normalizedBlock = canonicalBlock.replaceAll("\r\n", "\n").trim();
  if (!normalizedContent.includes(normalizedBlock)) {
    return [
      {
        rule: "org-workflow-block",
        message:
          "AGENTS.md must include the org Agent workflow block verbatim (see .github/agents-org-workflow-block.md)",
      },
    ];
  }
  return [];
}

export function findingsForClaudeMd(repoRoot: string): LintFinding[] {
  if (existsSync(join(repoRoot, "CLAUDE.md"))) {
    return [
      {
        rule: "forbidden-claude-md",
        message: "CLAUDE.md is not allowed; use AGENTS.md only",
      },
    ];
  }
  return [];
}

export function lintAgentsMd(options: AgentsMdLintOptions): LintFinding[] {
  const agentsPath = options.agentsRelativePath ?? AGENTS_MD_BASENAME;
  const content = loadAgentsMd(options.repoRoot, agentsPath);
  const maxLines = options.maxLines ?? MAX_LINES;
  const maxWords = options.maxWords ?? MAX_WORDS;
  const scriptNames =
    options.packageJsonNames ?? readPackageScriptNames(options.repoRoot);

  const findings: LintFinding[] = [
    ...findingsForSize(content, maxLines, maxWords),
    ...findingsForFiller(content),
    ...findingsForNpmScripts(content, scriptNames),
    ...findingsForRepoPaths(content, options.repoRoot),
    ...findingsForRequiredCheckNaming(content),
    ...findingsForClaudeMd(options.repoRoot),
  ];

  if (options.requireOrgWorkflowBlock && options.orgWorkflowBlockPath) {
    const block = readFileSync(options.orgWorkflowBlockPath, "utf8");
    findings.push(...findingsForOrgWorkflowBlock(content, block));
  }

  return findings;
}

export function formatFinding(finding: LintFinding, agentsBasename = AGENTS_MD_BASENAME): string {
  const location =
  finding.line === undefined ? "" : ` file=${agentsBasename},line=${finding.line}`;
  return `::error${location}::[agents-md:${finding.rule}] ${finding.message}`;
}

export function reportFindings(findings: readonly LintFinding[]): void {
  for (const finding of findings) {
    console.error(formatFinding(finding));
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
    orgWorkflowBlockPath: existsSync(orgBlockPath) ? orgBlockPath : undefined,
    requireOrgWorkflowBlock: requireBlock,
    maxLines: Number.isFinite(maxLines) ? maxLines : MAX_LINES,
    maxWords: Number.isFinite(maxWords) ? maxWords : MAX_WORDS,
  });

  if (findings.length === 0) {
    console.log(`${basename(agentsRelative)} passed agents-md lint.`);
    return 0;
  }
  reportFindings(findings);
  console.error(`agents-md lint failed with ${findings.length} finding(s).`);
  return 1;
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