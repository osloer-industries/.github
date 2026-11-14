/** Unit tests for run-mutation-changed.ts */

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  findMutableSrcChanges,
  isMutableSrcFile,
  listChangedPaths,
  resolveCallerRepoRoot,
  runMutationChangedCli,
} from "./run-mutation-changed.ts";

const defaultGit = process.env.MUTATION_GIT_PATH ?? "git";

function initGitRepo(repoDir: string): void {
  execFileSync(defaultGit, ["init"], { cwd: repoDir });
  execFileSync(defaultGit, ["config", "user.email", "ci@example.com"], { cwd: repoDir });
  execFileSync(defaultGit, ["config", "user.name", "CI"], { cwd: repoDir });
}

function gitCommit(repoDir: string, message: string, paths: string[]): string {
  for (const rel of paths) {
    execFileSync(defaultGit, ["add", rel], { cwd: repoDir });
  }
  execFileSync(defaultGit, ["commit", "-m", message], { cwd: repoDir });
  return execFileSync(defaultGit, ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
}

test("isMutableSrcFile accepts production src and rejects tests", () => {
  assert.equal(isMutableSrcFile("src/index.ts"), true);
  assert.equal(isMutableSrcFile("src/lib/foo.ts"), true);
  assert.equal(isMutableSrcFile("src/index.test.ts"), false);
  assert.equal(isMutableSrcFile("scripts/setup-lib.mjs"), false);
});

test("findMutableSrcChanges keeps only mutable src files", () => {
  assert.deepEqual(
    findMutableSrcChanges([
      "src/index.ts",
      "src/index.test.ts",
      "package.json",
    ]),
    ["src/index.ts"],
  );
});

test("resolveCallerRepoRoot uses MUTATION_REPO_ROOT when set", () => {
  const moduleUrl = fileURLToPath(new URL("./run-mutation-changed.ts", import.meta.url));
  const prev = process.env.MUTATION_REPO_ROOT;
  process.env.MUTATION_REPO_ROOT = "/tmp/caller";
  try {
    assert.equal(resolveCallerRepoRoot(moduleUrl), "/tmp/caller");
  } finally {
    if (prev === undefined) {
      delete process.env.MUTATION_REPO_ROOT;
    } else {
      process.env.MUTATION_REPO_ROOT = prev;
    }
  }
});

test("listChangedPaths returns paths between refs", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "mutation-diff-"));
  try {
    initGitRepo(tempDir);
    writeFileSync(join(tempDir, "README.md"), "# base\n", "utf8");
    const base = gitCommit(tempDir, "base", ["README.md"]);
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "src", "index.ts"), "export {};\n", "utf8");
    const head = gitCommit(tempDir, "src", ["src/index.ts"]);
    const changed = listChangedPaths(base, head, tempDir, defaultGit);
    assert.deepEqual(changed, ["src/index.ts"]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runMutationChangedCli skips when no mutable src changes", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "mutation-skip-"));
  try {
    initGitRepo(tempDir);
    const scriptsDir = join(tempDir, "scripts");
    mkdirSync(scriptsDir, { recursive: true });
    const modulePath = join(scriptsDir, "run-mutation-changed.ts");
    writeFileSync(
      modulePath,
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "run-mutation-changed.ts"),
        "utf8",
      ),
      "utf8",
    );
    writeFileSync(join(tempDir, "README.md"), "# base\n", "utf8");
    const base = gitCommit(tempDir, "base", ["README.md", "scripts/run-mutation-changed.ts"]);
    writeFileSync(join(tempDir, "AGENTS.md"), "# agents\n", "utf8");
    const head = gitCommit(tempDir, "docs", ["AGENTS.md"]);
    const moduleUrl = `file://${modulePath}`;
    let output = "";
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      runMutationChangedCli(moduleUrl, [base, head]);
    } finally {
      process.stdout.write = originalWrite;
    }
    assert.match(output, /No mutable src\/ changes/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runMutationChangedCli invokes Stryker for mutable src paths", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "mutation-run-"));
  try {
    initGitRepo(tempDir);
    const scriptsDir = join(tempDir, "scripts");
    mkdirSync(scriptsDir, { recursive: true });
    const modulePath = join(scriptsDir, "run-mutation-changed.ts");
    writeFileSync(
      modulePath,
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "run-mutation-changed.ts"),
        "utf8",
      ),
      "utf8",
    );
    writeFileSync(join(tempDir, "README.md"), "# base\n", "utf8");
    const base = gitCommit(tempDir, "base", ["README.md", "scripts/run-mutation-changed.ts"]);
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "src", "index.ts"), "export {};\n", "utf8");
    const head = gitCommit(tempDir, "src", ["src/index.ts"]);
    mkdirSync(join(tempDir, "node_modules", ".bin"), { recursive: true });
    const strykerPath = join(tempDir, "node_modules", ".bin", "stryker");
    writeFileSync(strykerPath, "#!/bin/sh\necho \"$@\" > .stryker-invoked\nexit 0\n", "utf8");
    chmodSync(strykerPath, 0o755);
    const moduleUrl = `file://${modulePath}`;
    runMutationChangedCli(moduleUrl, [base, head]);
    const invoked = readFileSync(join(tempDir, ".stryker-invoked"), "utf8");
    assert.match(invoked, /src\/index\.ts/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});