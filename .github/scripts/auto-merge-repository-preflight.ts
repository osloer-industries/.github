#!/usr/bin/env node
/**
 * Safety preflight: only proceed with auto-merge when the default branch requires
 * the ci-passed status check (ruleset or branch protection). Without it, GitHub may
 * merge immediately when auto-merge is enabled.
 */
import { appendFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CI_PASSED_CONTEXT = "ci-passed";

const GH_BIN_CANDIDATES = ["/usr/bin/gh", "/bin/gh"] as const;

function resolveGhBinary(): string {
  for (const candidate of GH_BIN_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  console.error(
    "::error::gh CLI not found at /usr/bin/gh or /bin/gh; install GitHub CLI on the runner.",
  );
  process.exit(1);
}

export interface GhApiResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function ghApi(path: string, token: string): GhApiResult {
  const result = spawnSync(resolveGhBinary(), ["api", path, "--paginate"], {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function isCiPassedContext(context: string): boolean {
  const trimmed = context.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed === CI_PASSED_CONTEXT) {
    return true;
  }
  const segments = trimmed.split("/").map((part) => part.trim());
  const last = segments.at(-1);
  return last === CI_PASSED_CONTEXT;
}

interface RequiredStatusCheckRow {
  context?: string;
}

interface RulesetParameters {
  required_status_checks?: RequiredStatusCheckRow[];
  contexts?: string[];
}

interface RulesetRule {
  type?: string;
  parameters?: RulesetParameters;
}

interface RulesetSummary {
  id?: number;
  enforcement?: string;
  target?: string;
}

function pushNonEmpty(contexts: string[], value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    contexts.push(trimmed);
  }
}

function appendStatusCheckRows(
  contexts: string[],
  rows: RequiredStatusCheckRow[] | undefined,
): void {
  if (!Array.isArray(rows)) {
    return;
  }
  for (const row of rows) {
    pushNonEmpty(contexts, row.context);
  }
}

function appendLegacyContextStrings(
  contexts: string[],
  values: string[] | undefined,
): void {
  if (!Array.isArray(values)) {
    return;
  }
  for (const value of values) {
    pushNonEmpty(contexts, value);
  }
}

export function contextsFromRulesetRules(rules: RulesetRule[]): string[] {
  const contexts: string[] = [];
  for (const rule of rules) {
    if (rule.type !== "required_status_checks") {
      continue;
    }
    const params = rule.parameters;
    if (params === undefined) {
      continue;
    }
    appendStatusCheckRows(contexts, params.required_status_checks);
    appendLegacyContextStrings(contexts, params.contexts);
  }
  return contexts;
}

function contextsFromProtectionChecks(rows: unknown): string[] {
  const contexts: string[] = [];
  if (!Array.isArray(rows)) {
    return contexts;
  }
  for (const row of rows) {
    if (row !== null && typeof row === "object") {
      pushNonEmpty(contexts, (row as { context?: string }).context);
    }
  }
  return contexts;
}

export function contextsFromBranchProtection(payload: Record<string, unknown>): string[] {
  const block = payload.required_status_checks;
  if (block === null || typeof block !== "object") {
    return [];
  }
  const checks = block as Record<string, unknown>;
  const contexts = contextsFromProtectionChecks(checks.checks);
  appendLegacyContextStrings(
    contexts,
    Array.isArray(checks.contexts)
      ? checks.contexts.filter((ctx): ctx is string => typeof ctx === "string")
      : undefined,
  );
  return contexts;
}

export function ciPassedRequiredInContexts(contexts: string[]): boolean {
  return contexts.some((ctx) => isCiPassedContext(ctx));
}

export type CiPassedPreflightResult =
  | { proceed: true }
  | { proceed: false; reason: string };

export function evaluateCiPassedPreflight(
  contexts: string[],
): CiPassedPreflightResult {
  if (ciPassedRequiredInContexts(contexts)) {
    return { proceed: true };
  }
  return {
    proceed: false,
    reason:
      "default branch does not require the ci-passed status check; skipping auto-merge to avoid immediate merges.",
  };
}

function writeOutput(name: string, value: string): void {
  const outputPath = (process.env.GITHUB_OUTPUT ?? "").trim();
  if (outputPath.length === 0) {
    return;
  }
  const escaped = value.replaceAll("\n", "%0A");
  appendFileSync(outputPath, `${name}=${escaped}\n`, "utf8");
}

function parseJsonArray<T>(stdout: string): T[] {
  const parsed = JSON.parse(stdout) as T[];
  if (!Array.isArray(parsed)) {
    throw new TypeError("expected JSON array");
  }
  return parsed;
}

function loadRulesetContexts(
  token: string,
  owner: string,
  repo: string,
): string[] {
  const list = ghApi(`repos/${owner}/${repo}/rulesets`, token);
  if (!list.ok) {
    return [];
  }
  let summaries: RulesetSummary[];
  try {
    summaries = parseJsonArray<RulesetSummary>(list.stdout);
  } catch {
    return [];
  }
  const contexts: string[] = [];
  for (const summary of summaries) {
    const id = summary.id;
    const enforcement = (summary.enforcement ?? "").toLowerCase();
    if (id === undefined || enforcement !== "active") {
      continue;
    }
    const detail = ghApi(`repos/${owner}/${repo}/rulesets/${id}`, token);
    if (!detail.ok) {
      continue;
    }
    let body: { rules?: RulesetRule[] };
    try {
      body = JSON.parse(detail.stdout) as { rules?: RulesetRule[] };
    } catch {
      continue;
    }
    const rules = body.rules ?? [];
    contexts.push(...contextsFromRulesetRules(rules));
  }
  return contexts;
}

function loadBranchProtectionContexts(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string,
): string[] {
  const path = `repos/${owner}/${repo}/branches/${encodeURIComponent(defaultBranch)}/protection`;
  const result = ghApi(path, token);
  if (!result.ok) {
    return [];
  }
  try {
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    return contextsFromBranchProtection(payload);
  } catch {
    return [];
  }
}

export function mainWithDeps(deps: {
  fetchRepoMeta: (token: string, repository: string) => { ok: boolean; defaultBranch: string };
  fetchContexts: (token: string, owner: string, repo: string, defaultBranch: string) => string[];
}): void {
  const token = (process.env.GITHUB_TOKEN ?? "").trim();
  const repository = (process.env.GITHUB_REPOSITORY ?? "").trim();
  if (token.length === 0) {
    console.error("::error::GITHUB_TOKEN is required.");
    process.exit(1);
  }
  if (!repository.includes("/")) {
    console.error("::error::GITHUB_REPOSITORY must be owner/name.");
    process.exit(1);
  }

  const meta = deps.fetchRepoMeta(token, repository);
  if (!meta.ok) {
    console.error("::error::Failed to load repository metadata.");
    process.exit(1);
  }

  const [owner, repo] = repository.split("/");
  const contexts = deps.fetchContexts(token, owner, repo, meta.defaultBranch);
  const decision = evaluateCiPassedPreflight(contexts);
  writeOutput("proceed", decision.proceed ? "true" : "false");
  writeOutput("skip-reason", "reason" in decision ? decision.reason : "");

  if (!decision.proceed) {
    console.log(`Skipping auto-merge safety preflight: ${decision.reason}`);
    return;
  }
  console.log("ci-passed is required on the default branch; auto-merge may proceed.");
}

function defaultFetchRepoMeta(
  token: string,
  repository: string,
): { ok: boolean; defaultBranch: string } {
  const result = ghApi(`repos/${repository}`, token);
  if (!result.ok) {
    return { ok: false, defaultBranch: "" };
  }
  try {
    const body = JSON.parse(result.stdout) as { default_branch?: string };
    const branch = (body.default_branch ?? "").trim();
    if (branch.length === 0) {
      return { ok: false, defaultBranch: "" };
    }
    return { ok: true, defaultBranch: branch };
  } catch {
    return { ok: false, defaultBranch: "" };
  }
}

function defaultFetchContexts(
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string,
): string[] {
  const fromRulesets = loadRulesetContexts(token, owner, repo);
  const fromProtection = loadBranchProtectionContexts(token, owner, repo, defaultBranch);
  return [...fromRulesets, ...fromProtection];
}

function main(): void {
  mainWithDeps({
    fetchRepoMeta: defaultFetchRepoMeta,
    fetchContexts: defaultFetchContexts,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}