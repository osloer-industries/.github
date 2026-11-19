#!/usr/bin/env node
/** Run the CodeQL SARIF gate script (same entry point as the reusable workflow). */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = join(
  dirname(fileURLToPath(import.meta.url)),
  "codeql-sarif-security-gate.ts",
);

function main(): number {
  const completed = spawnSync(process.execPath, [GATE], {
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