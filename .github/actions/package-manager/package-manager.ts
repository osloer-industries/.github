#!/usr/bin/env node
/**
 * Install, audit, and run scripts with npm or bun. Used by org reusable workflows via
 * the package-manager composite action (cross-repo: osloer-industries/.github/...@${{ job.workflow_sha }}).
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type PackageManager = "npm" | "bun";

const ALLOWED: readonly PackageManager[] = ["npm", "bun"];

export function parsePackageManager(raw: string | undefined): PackageManager {
  const value = (raw ?? "").trim();
  if ((ALLOWED as readonly string[]).includes(value)) {
    return value as PackageManager;
  }
  throw new Error(
    `Invalid package-manager "${value}". Allowed values: ${ALLOWED.join(", ")}.`,
  );
}

function resolveWorkingDirectory(explicitCwd?: string): string {
  if (explicitCwd && explicitCwd.length > 0) {
    return explicitCwd;
  }
  const fromEnv = (process.env.WORKING_DIRECTORY ?? "").trim();
  if (fromEnv.length > 0) {
    return fromEnv;
  }
  return process.cwd();
}

function runCommand(
  executable: string,
  args: string[],
  cwd?: string,
): void {
  execFileSync(executable, args, {
    cwd: resolveWorkingDirectory(cwd),
    stdio: "inherit",
  });
}

export function installDependencies(
  pm: PackageManager,
  ignoreScripts: boolean,
  prefixes: readonly string[],
): void {
  const rootFlags: string[] =
    pm === "npm"
      ? ignoreScripts
        ? ["ci", "--ignore-scripts"]
        : ["ci"]
      : ignoreScripts
        ? ["install", "--frozen-lockfile", "--ignore-scripts"]
        : ["install", "--frozen-lockfile"];

  runCommand(pm, rootFlags);

  for (const prefix of prefixes) {
    if (prefix.length === 0) {
      continue;
    }
    if (pm === "npm") {
      runCommand(pm, [...rootFlags, "--prefix", prefix]);
    } else {
      runCommand(pm, rootFlags, prefix);
    }
  }
}

export function auditProduction(
  pm: PackageManager,
  auditLevel: string,
  prefixes: readonly string[],
): void {
  if (pm === "npm") {
    runCommand(pm, ["audit", "--omit=dev", `--audit-level=${auditLevel}`]);
    for (const prefix of prefixes) {
      if (prefix.length === 0) {
        continue;
      }
      runCommand(pm, [
        "audit",
        "--omit=dev",
        `--audit-level=${auditLevel}`,
        "--prefix",
        prefix,
      ]);
    }
    return;
  }

  runCommand(pm, ["audit", "--production", "--audit-level", auditLevel]);
  for (const prefix of prefixes) {
    if (prefix.length === 0) {
      continue;
    }
    runCommand(pm, ["audit", "--production", "--audit-level", auditLevel], prefix);
  }
}

export function runPackageScript(
  pm: PackageManager,
  scriptName: string,
  extraArgs: readonly string[],
): void {
  const args = ["run", scriptName];
  if (extraArgs.length > 0) {
    args.push("--", ...extraArgs);
  }
  runCommand(pm, args);
}

function parsePrefixesJson(json: string | undefined): string[] {
  const raw = (json ?? "[]").trim();
  if (raw.length === 0) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("NPM_PREFIXES_JSON must be a JSON array of strings.");
  }
  return parsed.map((entry) => {
    if (typeof entry !== "string") {
      throw new Error("NPM_PREFIXES_JSON array entries must be strings.");
    }
    return entry;
  });
}

function parseRunArgs(raw: string | undefined): string[] {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return [];
  }
  return value.split(/\s+/).filter((part) => part.length > 0);
}

export function runPackageManagerCli(argv: readonly string[]): void {
  const command = argv[0];
  const pm = parsePackageManager(process.env.PACKAGE_MANAGER);

  switch (command) {
    case "validate": {
      process.stdout.write(`package-manager: ${pm}\n`);
      return;
    }
    case "install": {
      const ignoreScripts =
        (process.env.NPM_CI_IGNORE_SCRIPTS ?? "true").trim() === "true";
      const prefixes = parsePrefixesJson(process.env.NPM_PREFIXES_JSON);
      installDependencies(pm, ignoreScripts, prefixes);
      return;
    }
    case "audit": {
      const auditLevel = (process.env.AUDIT_LEVEL ?? "high").trim();
      const prefixes = parsePrefixesJson(process.env.NPM_PREFIXES_JSON);
      auditProduction(pm, auditLevel, prefixes);
      return;
    }
    case "run": {
      const scriptName = (process.env.NPM_SCRIPT ?? "").trim();
      if (scriptName.length === 0) {
        throw new Error("NPM_SCRIPT must be set for run.");
      }
      const extraArgs = parseRunArgs(process.env.RUN_ARGS);
      runPackageScript(pm, scriptName, extraArgs);
      return;
    }
    default:
      throw new Error(
        `Unknown command "${command ?? ""}". Use validate, install, audit, or run.`,
      );
  }
}

function isDirectExecution(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (argvEntry === undefined) {
    return false;
  }
  return moduleUrl === pathToFileURL(resolve(argvEntry)).href;
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try {
    runPackageManagerCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}