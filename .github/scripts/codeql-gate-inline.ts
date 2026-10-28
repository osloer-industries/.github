#!/usr/bin/env node
/** Extract and verify the inline CodeQL SARIF gate shipped in the reusable workflow. */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = join(REPO_ROOT, ".github/workflows/codeql-javascript-typescript.yml");
const CANONICAL = join(REPO_ROOT, ".github/scripts/codeql-sarif-security-gate.ts");
const MARKER = "CODEQL_SARIF_GATE_INLINE";
const INLINE_INDENT = "          ";
const HEREDOC_TARGET = `cat <<'${MARKER}' >"$GATE_TS"`;

function canonicalBody(): string {
  let text = readFileSync(CANONICAL, { encoding: "utf-8" });
  const lines = text.split("\n");
  if (lines[0]?.startsWith("#!")) {
    lines.shift();
  }
  while (lines.length > 0 && !lines[0]?.trim()) {
    lines.shift();
  }
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) {
    lines.pop();
  }
  return `${lines.join("\n")}\n`;
}

function indentScript(body: string): string {
  return body
    .split("\n")
    .map((line) => `${INLINE_INDENT}${line}`)
    .join("\n");
}

function extractInlineBody(workflowPath: string = WORKFLOW): string {
  const content = readFileSync(workflowPath, { encoding: "utf-8" });
  const escapedTarget = HEREDOC_TARGET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^[ \\t]*${escapedTarget}\\n` +
      "([\\s\\S]*?)" +
      `^[ \\t]*${MARKER}[ \\t]*\\n`,
    "m",
  );
  const match = pattern.exec(content);
  if (!match) {
    throw new Error(
      `Inline gate marker <<'${MARKER}' not found in ${workflowPath}`,
    );
  }
  let lines = match[1].split("\n");
  while (lines.length > 0 && !lines[0]?.trim()) {
    lines.shift();
  }
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) {
    lines.pop();
  }
  if (lines.length === 0) {
    return "";
  }
  const stripped: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      stripped.push("");
      continue;
    }
    if (!line.startsWith(INLINE_INDENT)) {
      throw new Error(
        `Inline gate line missing workflow indent prefix: ${JSON.stringify(line.slice(0, 40))}`,
      );
    }
    stripped.push(line.slice(INLINE_INDENT.length));
  }
  while (stripped.length > 0 && !stripped[0]?.trim()) {
    stripped.shift();
  }
  while (stripped.length > 0 && !stripped[stripped.length - 1]?.trim()) {
    stripped.pop();
  }
  return `${stripped.join("\n")}\n`;
}

function assertInlineMatchesCanonical(): void {
  const canonical = canonicalBody();
  const inline = extractInlineBody();
  if (canonical !== inline) {
    console.error(
      "Inline gate in codeql-javascript-typescript.yml does not match " +
        `${relative(REPO_ROOT, CANONICAL)}; run ` +
        `node ${relative(REPO_ROOT, fileURLToPath(import.meta.url))} --write`,
    );
    process.exit(1);
  }
}

function writeInlineIntoWorkflow(): void {
  const body = indentScript(canonicalBody().replace(/\n$/, ""));
  const content = readFileSync(WORKFLOW, { encoding: "utf-8" });
  const escapedTarget = HEREDOC_TARGET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^[ \\t]*${escapedTarget}\\n)` +
      "[\\s\\S]*?" +
      `(^[ \\t]*${MARKER}[ \\t]*\\n)`,
    "m",
  );
  const updated = content.replace(pattern, `$1${body}\n$2`);
  if (updated === content) {
    console.error("Could not locate inline gate block to update");
    process.exit(1);
  }
  writeFileSync(WORKFLOW, updated, { encoding: "utf-8" });
}

function usage(): never {
  console.error(`Usage: ${process.argv[1]} (--check|--write)`);
  process.exit(2);
}

function runCli(): number {
  if (process.argv.length !== 3) {
    usage();
  }
  const arg = process.argv[2];
  if (arg === "--check") {
    assertInlineMatchesCanonical();
    console.log("Inline gate matches canonical script.");
    return 0;
  }
  if (arg === "--write") {
    writeInlineIntoWorkflow();
    console.log(
      `Updated inline gate in ${relative(REPO_ROOT, WORKFLOW)}`,
    );
    return 0;
  }
  console.error(`Unknown option: ${arg}`);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}

export { assertInlineMatchesCanonical, canonicalBody, extractInlineBody };
