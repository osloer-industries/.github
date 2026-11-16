#!/usr/bin/env node
/**
 * Run agents-md-lint against osloer-industries fleet repos at main (local smoke).
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintAgentsMd } from "./agents-md-lint.ts";

const FLEET = [
  "osloer-industries/.github",
  "osloer-industries/typescript-node-template",
  "osloer-industries/vakt",
  "osloer-industries/lunch-money",
  "osloer-industries/lunch-money-de-invest-sync",
  "osloer-industries/homeexchange-mcp",
] as const;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const orgBlockPath = resolve(scriptDir, "../agents-org-workflow-block.md");

const GH_BIN_CANDIDATES = ["/usr/bin/gh", "/bin/gh"] as const;

function resolveGhBinary(): string {
  for (const candidate of GH_BIN_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("gh CLI not found at /usr/bin/gh or /bin/gh");
}

function cloneRepo(slug: string, dir: string): string | null {
  try {
    execFileSync(resolveGhBinary(), ["repo", "clone", slug, dir, "--", "--depth", "1"], {
      stdio: "pipe",
    });
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.split("\n").at(-2) ?? msg;
  }
}

function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll("|", String.raw`\|`);
}

function summarize(findings: ReturnType<typeof lintAgentsMd>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    const key = `${f.severity}:${f.rule}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const rows: string[] = [];
const tempRoot = mkdtempSync(join(tmpdir(), "agents-md-fleet-"));

try {
  for (const slug of FLEET) {
    const dir = join(tempRoot, slug.split("/")[1] ?? slug);
    if (slug === "osloer-industries/.github") {
      cpSync(resolve(scriptDir, "../.."), dir, { recursive: true });
    } else {
      const cloneErr = cloneRepo(slug, dir);
      if (cloneErr) {
        rows.push(
          "| " +
            slug +
            " | clone failed | " +
            escapeMarkdownTableCell(cloneErr) +
            " |",
        );
        continue;
      }
    }
    const agentsPath = existsSync(join(dir, "AGENTS.md")) ? "AGENTS.md" : "(missing)";
    if (agentsPath === "(missing)") {
      rows.push(`| ${slug} | missing AGENTS.md | — |`);
      continue;
    }
    const findings = lintAgentsMd({
      repoRoot: dir,
      orgWorkflowBlockPath: orgBlockPath,
      requireOrgWorkflowBlock: true,
    });
    const errors = findings.filter((f) => f.severity === "error").length;
    const warnings = findings.filter((f) => f.severity === "warning").length;
    const byRule = summarize(findings);
    const detail = Object.entries(byRule)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    rows.push(`| ${slug} | ${errors} errors, ${warnings} warnings | ${detail || "—"} |`);
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

const table = ["| Repo | Result | Rules |", "| --- | --- | --- |", ...rows].join("\n");
writeFileSync(resolve(scriptDir, "../test-fixtures/agents-md-fleet-report.md"), `${table}\n`, "utf8");
console.log(table);