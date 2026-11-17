#!/usr/bin/env node
/** Lint canonical org block fragment with a synthetic H1 (fragment file has markers only). */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dotGithub = resolve(scriptDir, "..");
const blockPath = join(dotGithub, "agents-org-workflow-block.md");
const tempDir = mkdtempSync(join(tmpdir(), "org-block-md-"));

try {
  const wrapped = `# Canonical org agent workflow block\n\n${readFileSync(blockPath, "utf8")}`;
  const target = join(tempDir, "agents-org-workflow-block.wrap.md");
  writeFileSync(target, wrapped, "utf8");
  execFileSync(
    join(dotGithub, "node_modules", ".bin", "markdownlint-cli2"),
    ["--config", ".markdownlint-cli2.jsonc", target],
    { cwd: dotGithub, stdio: "inherit" },
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}