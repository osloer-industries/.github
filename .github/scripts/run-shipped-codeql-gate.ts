#!/usr/bin/env node
/** Run the CodeQL SARIF gate exactly as shipped in the reusable workflow. */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractInlineBody } from "./codeql-gate-inline.ts";

function main(): number {
  const script = extractInlineBody();
  const dir = mkdtempSync(join(tmpdir(), "codeql-gate-"));
  const path = join(dir, "gate.mts");
  writeFileSync(path, script, { encoding: "utf-8" });
  const completed = spawnSync(process.execPath, [path], {
    stdio: "inherit",
    env: process.env,
  });
  if (completed.error) {
    console.error(completed.error);
    return 2;
  }
  return completed.status ?? 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
