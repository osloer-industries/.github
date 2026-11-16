/** Unit tests for agents-md-lint.ts */

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  countWords,
  extractBacktickPaths,
  findingsForClaudeMd,
  findingsForFiller,
  findingsForNpmScripts,
  findingsForOrgWorkflowBlock,
  findingsForRepoPaths,
  findingsForRequiredCheckNaming,
  findingsForSize,
  lintAgentsMd,
  looksLikeRepoPath,
} from "./agents-md-lint.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orgBlockPath = resolve(scriptDir, "../agents-org-workflow-block.md");
const orgBlock = readFileSync(orgBlockPath, "utf8");
const passFixture = resolve(scriptDir, "../test-fixtures/agents-md/minimal-pass");

function tempRepo(name: string): string {
  return mkdtempSync(join(tmpdir(), name));
}

test("countWords ignores surrounding whitespace", () => {
  assert.equal(countWords("  one two  "), 2);
  assert.equal(countWords(""), 0);
});

test("findingsForSize enforces line and word budgets", () => {
  const small = "line\nline\n";
  assert.deepEqual(findingsForSize(small, 10, 100), []);
  const big = `${"word ".repeat(20)}\n`;
  const findings = findingsForSize(big, 1, 5);
  assert.ok(findings.some((f) => f.rule === "size-lines"));
  assert.ok(findings.some((f) => f.rule === "size-words"));
});

test("findingsForFiller flags banned phrases and emoji", () => {
  const filler = findingsForFiller("Follow best practices here.");
  assert.ok(filler.some((f) => f.rule === "filler-phrase"));
  const emoji = findingsForFiller("No symbols \u{1F600}");
  assert.ok(emoji.some((f) => f.rule === "emoji"));
});

test("findingsForNpmScripts requires package.json scripts", () => {
  const content = "Run `npm run missing` before push.";
  const findings = findingsForNpmScripts(content, ["check"]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.rule, "npm-script");
});

test("findingsForNpmScripts skips when no package.json scripts", () => {
  const content = "Run `npm run anything` when no manifest.";
  assert.deepEqual(findingsForNpmScripts(content, []), []);
});

test("extractBacktickPaths filters repo-like tokens", () => {
  const paths = extractBacktickPaths(
    "See `src/a.ts` and `ci-passed` and `.github/ci.yml`",
  );
  assert.deepEqual(
    paths.map((p) => p.path),
    ["src/a.ts", ".github/ci.yml"],
  );
});

test("looksLikeRepoPath rejects commands and URLs", () => {
  assert.equal(looksLikeRepoPath("npm run check"), false);
  assert.equal(looksLikeRepoPath("https://x/y"), false);
  assert.equal(looksLikeRepoPath(".github/scripts/x.ts"), true);
});

test("findingsForRepoPaths reports missing files", () => {
  const repo = tempRepo("agents-md-path-");
  try {
    writeFileSync(
      join(repo, "AGENTS.md"),
      "Path `missing/file.ts` is cited.\n",
      "utf8",
    );
    const findings = findingsForRepoPaths(
      readFileSync(join(repo, "AGENTS.md"), "utf8"),
      repo,
    );
    assert.equal(findings[0]?.rule, "repo-path");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("findingsForRequiredCheckNaming rejects non ci-passed sole required check", () => {
  const line =
    "Org rulesets require only `Quality` as the sole required status check.";
  const findings = findingsForRequiredCheckNaming(line);
  assert.ok(findings.some((f) => f.rule === "required-check-name"));
});

test("findingsForRequiredCheckNaming allows ci-passed", () => {
  const line = "`ci-passed` is the only required status check.";
  assert.deepEqual(findingsForRequiredCheckNaming(line), []);
});

test("findingsForOrgWorkflowBlock requires verbatim block", () => {
  const missing = findingsForOrgWorkflowBlock("short", orgBlock);
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.rule, "org-workflow-block");
  assert.match(missing[0]?.message ?? "", /verbatim/);
  assert.deepEqual(
    findingsForOrgWorkflowBlock(`${orgBlock}\n\n## Extra`, orgBlock),
    [],
  );
});

test("findingsForClaudeMd fails when CLAUDE.md exists", () => {
  const repo = tempRepo("agents-md-claude-");
  try {
    writeFileSync(join(repo, "CLAUDE.md"), "nope\n", "utf8");
    assert.equal(findingsForClaudeMd(repo)[0]?.rule, "forbidden-claude-md");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("lintAgentsMd passes minimal fixture with org block", () => {
  const findings = lintAgentsMd({
    repoRoot: passFixture,
    orgWorkflowBlockPath: orgBlockPath,
    requireOrgWorkflowBlock: true,
    maxLines: 220,
    maxWords: 3500,
  });
  assert.deepEqual(findings, []);
});

test("lintAgentsMd copies org block into temp repo root file", () => {
  const repo = tempRepo("agents-md-block-");
  try {
    cpSync(join(passFixture, "package.json"), join(repo, "package.json"));
    writeFileSync(join(repo, "AGENTS.md"), orgBlock, "utf8");
    const findings = lintAgentsMd({
      repoRoot: repo,
      orgWorkflowBlockPath: orgBlockPath,
      requireOrgWorkflowBlock: true,
    });
    assert.deepEqual(findings, []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("lintAgentsMd flags filler in temp repo", () => {
  const repo = tempRepo("agents-md-filler-");
  try {
    writeFileSync(join(repo, "AGENTS.md"), `${orgBlock}\n\nSimply do it.\n`, "utf8");
    const findings = lintAgentsMd({
      repoRoot: repo,
      orgWorkflowBlockPath: orgBlockPath,
      requireOrgWorkflowBlock: true,
    });
    assert.ok(findings.some((f) => f.rule === "filler-phrase"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("org block file stays embedded in repository AGENTS.md", () => {
  const agentsPath = resolve(scriptDir, "../../AGENTS.md");
  const agents = readFileSync(agentsPath, "utf8");
  assert.ok(agents.includes(orgBlock.trim()));
});