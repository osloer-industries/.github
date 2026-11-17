#!/usr/bin/env node
/**
 * PR dependency gate without GitHub Dependency Review (requires GHAS on private repos).
 *
 * Compares npm audit advisories on the merge base vs the PR head (prod deps only,
 * matching CI's --omit=dev). Fails when the PR introduces an advisory that was not
 * present on the base ref at the same npm advisory URL, with severity high or critical
 * (equivalent to dependency-review-action fail-on-severity: high).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const FAIL_RANK = 3; // high and critical

export const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
} as const;

export type SeverityLabel = keyof typeof SEVERITY_RANK;

export interface AdvisoryMeta {
  severity: string;
  name: string;
  title: string;
}

export interface AdvisoryVia {
  source?: number;
  name?: string;
  severity?: string;
  url?: string;
  title?: string;
}

export interface AuditVulnerability {
  severity?: string;
  via?: Array<string | AdvisoryVia>;
}

export interface AuditJson {
  vulnerabilities?: Record<string, AuditVulnerability>;
}

export interface NewlyIntroducedAdvisory extends AdvisoryMeta {
  key: string;
}

const baseRef = process.env["BASE_REF"] ?? "origin/main";

const nodeBin = process.env["NODE_BIN"];
const npmCli = process.env["NPM_CLI"];
const gitBin = process.env["GIT_BIN"];

/** Minimal env for subprocesses; absolute binaries avoid a writable PATH (Sonar S4036). */
const SUBPROCESS_ENV = {
  PATH: "/usr/bin:/bin",
  HOME: "/home/runner",
  LANG: "C.UTF-8",
};

function requireToolPaths(): void {
  if (!nodeBin || !npmCli || !gitBin) {
    throw new Error(
      "NODE_BIN, NPM_CLI, and GIT_BIN must be set by the workflow (absolute paths, fixed PATH lookup).",
    );
  }
}

function runNpm(
  args: string[],
  options: Parameters<typeof spawnSync>[2],
): ReturnType<typeof spawnSync> {
  if (!existsSync(npmCli)) {
    throw new Error(`Expected npm CLI at ${npmCli}`);
  }
  const res = spawnSync(nodeBin, [npmCli, ...args], {
    ...options,
    env: SUBPROCESS_ENV,
  });
  if (res.error) {
    throw new Error(`npm spawn failed: ${res.error.message}`);
  }
  return res;
}

export function parseAuditJson(text: string, context: string): AuditJson {
  if (!text.trim()) {
    throw new Error(`npm audit produced no JSON: ${context}`);
  }
  try {
    return JSON.parse(text) as AuditJson;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`npm audit returned invalid JSON (${context}): ${message}`, {
      cause: err,
    });
  }
}

function runAudit(cwd: string): AuditJson {
  const res = runNpm(["audit", "--omit=dev", "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const text = typeof res.stdout === "string" ? res.stdout : "";
  if (!text.trim()) {
    const stderr =
      typeof res.stderr === "string"
        ? res.stderr.trim()
        : res.stderr?.toString().trim();
    const detail = stderr || `exit ${String(res.status)}`;
    throw new Error(`npm audit produced no JSON on stdout in ${cwd}: ${detail}`);
  }
  return parseAuditJson(text, cwd);
}

function refHasFile(ref: string, path: string): boolean {
  const res = spawnSync(gitBin, ["cat-file", "-e", `${ref}:${path}`], {
    encoding: "utf8",
    env: SUBPROCESS_ENV,
  });
  if (res.error) {
    throw new Error(`git spawn failed: ${res.error.message}`);
  }
  return res.status === 0;
}

function gitShow(ref: string, path: string): string {
  const res = spawnSync(gitBin, ["show", `${ref}:${path}`], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: SUBPROCESS_ENV,
  });
  if (res.error) {
    throw new Error(`git spawn failed: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = typeof res.stderr === "string" ? res.stderr : res.stderr?.toString();
    throw new Error(stderr || `git show failed for ${ref}:${path}`);
  }
  return typeof res.stdout === "string" ? res.stdout : String(res.stdout ?? "");
}

function auditAtGitRef(ref: string): AuditJson {
  const dir = join(tmpdir(), `dep-audit-${String(process.pid)}-${String(Date.now())}`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, "package.json"), gitShow(ref, "package.json"));
    writeFileSync(join(dir, "package-lock.json"), gitShow(ref, "package-lock.json"));
    const install = runNpm(["ci", "--ignore-scripts", "--omit=dev"], {
      cwd: dir,
      stdio: "pipe",
    });
    if (install.status !== 0) {
      const stderr =
        typeof install.stderr === "string"
          ? install.stderr
          : install.stderr?.toString();
      throw new Error(stderr || "npm ci failed for base ref audit");
    }
    return runAudit(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function collectAdvisories(auditJson: AuditJson): Map<string, AdvisoryMeta> {
  const map = new Map<string, AdvisoryMeta>();
  for (const [name, vuln] of Object.entries(auditJson.vulnerabilities ?? {})) {
    const severity = vuln.severity ?? "moderate";
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || via === null) continue;
      const key = via.url ?? String(via.source ?? `${name}:${via.title ?? "unknown"}`);
      map.set(String(key), {
        severity: via.severity ?? severity,
        name,
        title: via.title ?? name,
      });
    }
  }
  return map;
}

export function rank(severity: string): number {
  if (severity in SEVERITY_RANK) {
    return SEVERITY_RANK[severity as SeverityLabel];
  }
  return 0;
}

export function findNewlyIntroducedHighCritical(
  headAdv: Map<string, AdvisoryMeta>,
  baseAdv: Map<string, AdvisoryMeta>,
  failRank: number = FAIL_RANK,
): NewlyIntroducedAdvisory[] {
  const newlyIntroduced: NewlyIntroducedAdvisory[] = [];
  for (const [key, meta] of headAdv) {
    if (baseAdv.has(key)) continue;
    if (rank(meta.severity) < failRank) continue;
    newlyIntroduced.push({ key, ...meta });
  }
  return newlyIntroduced;
}

function main(): number {
  requireToolPaths();

  console.log("Dependency diff audit (npm audit, no GHAS Dependency Review)");
  console.log(`Base ref: ${baseRef}`);
  console.log("Policy: fail on newly introduced advisories with severity high or critical");

  const headAudit = runAudit(process.cwd());

  if (!refHasFile(baseRef, "package-lock.json")) {
    console.log(
      "Base ref has no package-lock.json (e.g. npm migration); using head-only npm audit --audit-level=high.",
    );
    console.log(
      "Trade-off: cannot diff advisories vs merge base until both sides use npm lockfiles.",
    );
    const res = runNpm(["audit", "--omit=dev", "--audit-level=high"], {
      stdio: "inherit",
    });
    return res.status === 0 ? 0 : 1;
  }

  const baseAudit = auditAtGitRef(baseRef);

  const headAdv = collectAdvisories(headAudit);
  const baseAdv = collectAdvisories(baseAudit);
  const newlyIntroduced = findNewlyIntroducedHighCritical(headAdv, baseAdv);

  console.log(`Base advisories (all severities): ${String(baseAdv.size)}`);
  console.log(`Head advisories (all severities): ${String(headAdv.size)}`);
  console.log(`New high/critical advisories on this PR: ${String(newlyIntroduced.length)}`);

  if (newlyIntroduced.length === 0) {
    console.log("No new high or critical npm advisories compared to the merge base.");
    return 0;
  }

  for (const item of newlyIntroduced) {
    console.log("");
    console.log(`- [${item.severity}] ${item.title}`);
    console.log(`  package: ${item.name}`);
    console.log(`  advisory: ${item.key}`);
  }

  console.error(
    `\nDependency gate failed: ${String(newlyIntroduced.length)} new high/critical advisory(ies).`,
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}