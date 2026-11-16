/** Unit tests for agents-md-lint.ts */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  extractBacktickPaths,
  extractOrgBlockRegion,
  findingsForFiller,
  findingsForForbiddenAgentFiles,
  findingsForOrgWorkflowBlock,
  findingsForPackageScripts,
  findingsForRepoPaths,
  lintAgentsMd,
  looksLikeRepoPath,
  normalizeOrgBlockWhitespace,
  parsePackageScripts,
  stripCodeForProseScan,
} from "./agents-md-lint.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orgBlockPath = resolve(scriptDir, "../agents-org-workflow-block.md");
const canonicalRaw = readFileSync(orgBlockPath, "utf8");

function tempRepo(name: string): string {
  return mkdtempSync(join(tmpdir(), name));
}

test("stripCodeForProseScan ignores fenced and inline code", () => {
  const prose = stripCodeForProseScan("Plain text.\n```\nbest practices\n```\nAlso `best practices`.\n");
  assert.equal(/\bbest practices\b/i.test(prose), false);
});

test("findingsForFiller uses warnings for phrases and errors for emoji", () => {
  const filler = findingsForFiller("Avoid best practices.");
  assert.equal(filler[0]?.severity, "warning");
  const emoji = findingsForFiller("No \u{1F600}");
  assert.equal(emoji[0]?.severity, "error");
});

test("looksLikeRepoPath rejects globs and placeholders", () => {
  assert.equal(looksLikeRepoPath("src/**/*.ts"), false);
  assert.equal(looksLikeRepoPath("src/<name>.ts"), false);
  assert.equal(looksLikeRepoPath(".github/scripts/x.ts"), true);
});

test("parsePackageScripts fails closed on invalid json", () => {
  const repo = tempRepo("pkg-invalid-");
  try {
    writeFileSync(join(repo, "package.json"), "{", "utf8");
    const result = parsePackageScripts(join(repo, "package.json"));
    assert.equal(result.errorFinding?.rule, "package-json-invalid");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("findingsForPackageScripts requires manifest when citing scripts", () => {
  const findings = findingsForPackageScripts(
    "Run `npm run ghost`",
    { scriptNames: [], errorFinding: null, citedWithoutManifest: false },
    false,
  );
  assert.equal(findings[0]?.rule, "npm-script");
});

test("findingsForPackageScripts skips file runs", () => {
  const findings = findingsForPackageScripts(
    "Run `bun run src/index.ts`",
    { scriptNames: ["check"], errorFinding: null, citedWithoutManifest: false },
    true,
  );
  assert.deepEqual(findings, []);
});

test("extractBacktickPaths uses static glob prefix", () => {
  const paths = extractBacktickPaths("See `.github/workflows/*.yml`");
  assert.deepEqual(paths.map((p) => p.path), [".github/workflows/"]);
});

test("findingsForRepoPaths rejects paths outside repo", () => {
  const repo = tempRepo("paths-");
  try {
    const content = "Use `../../etc/passwd`\n";
    const findings = findingsForRepoPaths(content, repo, "AGENTS.md");
    assert.equal(findings[0]?.rule, "repo-path");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("org block markers and normalization", () => {
  const embedded = `${canonicalRaw}\n`;
  assert.ok(extractOrgBlockRegion(embedded));
  const norm = normalizeOrgBlockWhitespace("a\n\n\n\nb");
  assert.equal(norm, "a\n\nb");
});

test("findingsForOrgWorkflowBlock passes when markers and body match", () => {
  const content = `# Title\n\n${canonicalRaw}\n`;
  assert.deepEqual(findingsForOrgWorkflowBlock(content, canonicalRaw), []);
});

test("lintAgentsMd passes when AGENTS.md embeds marked canonical block", () => {
  const findings = lintAgentsMd({
    repoRoot: resolve(scriptDir, "../.."),
    orgWorkflowBlockPath: orgBlockPath,
    requireOrgWorkflowBlock: true,
  });
  const errors = findings.filter((f) => f.severity === "error");
  assert.deepEqual(errors, []);
});

test("findingsForForbiddenAgentFiles flags tracked CLAUDE.md", () => {
  const repo = tempRepo("forbidden-");
  try {
    writeFileSync(join(repo, "CLAUDE.md"), "x\n", "utf8");
    writeFileSync(join(repo, "AGENTS.md"), "ok\n", "utf8");
    cpSync(
      join(resolve(scriptDir, "../.."), "AGENTS.md"),
      join(repo, "AGENTS.md"),
    );
    execFileSync("git", ["init"], { cwd: repo });
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "init", "--no-gpg-sign"], { cwd: repo });
    const findings = findingsForForbiddenAgentFiles(repo);
    assert.ok(findings.some((f) => f.rule === "forbidden-agent-file"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});