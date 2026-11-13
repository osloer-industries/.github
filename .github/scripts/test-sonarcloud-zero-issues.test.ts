/** Unit tests for sonarcloud-zero-issues.ts */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analysisMatchesHead,
  fetchOpenIssues,
  parseConfigFromEnv,
  resolveProjectKey,
  runSonarZeroIssuesGate,
  waitForPullRequestAnalysis,
  type FetchLike,
  type SonarConfig,
} from "./sonarcloud-zero-issues.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function baseConfig(overrides: Partial<SonarConfig> = {}): SonarConfig {
  const now = Date.now();
  return {
    token: "secret-token",
    host: "https://sonarcloud.io",
    projectKey: "osloer-industries_demo",
    pullRequestNumber: 17,
    headSha: "a".repeat(40),
    pollIntervalMs: 5,
    startedAtMs: now,
    deadlineMs: now + 60_000,
    organization: "osloer-industries",
    ...overrides,
  };
}

test("resolveProjectKey uses explicit key when set", () => {
  assert.equal(resolveProjectKey("custom_key", "org", "repo"), "custom_key");
  assert.equal(
    resolveProjectKey("  ", "osloer-industries", "lunch-money"),
    "osloer-industries_lunch-money",
  );
});

function withMockedExit(run: () => void): number | undefined {
  let code: number | undefined;
  const originalExit = process.exit;
  process.exit = ((exitCode?: number) => {
    code = exitCode ?? 0;
    throw new Error("process.exit");
  }) as typeof process.exit;
  try {
    run();
    return code;
  } catch (error) {
    assert.equal((error as Error).message, "process.exit");
    return code;
  } finally {
    process.exit = originalExit;
  }
}

test("parseConfigFromEnv fails when SONAR_TOKEN is missing", () => {
  const exitCode = withMockedExit(() =>
    parseConfigFromEnv({
      GITHUB_EVENT_NAME: "pull_request",
      PULL_REQUEST_NUMBER: "17",
      HEAD_SHA: "b".repeat(40),
      GITHUB_REPOSITORY_NAME: "demo",
    }),
  );
  assert.equal(exitCode, 1);
});

test("parseConfigFromEnv rejects non pull_request events", () => {
  const exitCode = withMockedExit(() =>
    parseConfigFromEnv({
      SONAR_TOKEN: "tok",
      GITHUB_EVENT_NAME: "push",
      PULL_REQUEST_NUMBER: "1",
      HEAD_SHA: "c".repeat(40),
      GITHUB_REPOSITORY_NAME: "demo",
    }),
  );
  assert.equal(exitCode, 1);
});

test("waitForPullRequestAnalysis succeeds when commit sha matches", async () => {
  const config = baseConfig();
  let calls = 0;
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    calls += 1;
    if (url.includes("/api/project_pull_requests/list")) {
      return jsonResponse({
        pullRequests: [
          {
            key: "17",
            analysisDate: "2026-11-12T10:00:00+0000",
            commit: { sha: config.headSha },
          },
        ],
      });
    }
    if (url.includes("/api/ce/activity")) {
      return jsonResponse({ tasks: [] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await waitForPullRequestAnalysis(config, fetchImpl, {
    sleep: async () => undefined,
    now: () => config.startedAtMs,
  });
  assert.equal(result.key, "17");
  assert.equal(calls >= 1, true);
});

test("waitForPullRequestAnalysis times out when commit never matches", async () => {
  const config = baseConfig({ pollIntervalMs: 1, deadlineMs: Date.now() + 3 });
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes("/api/project_pull_requests/list")) {
      return jsonResponse({
        pullRequests: [
          { key: "17", commit: { sha: "f".repeat(40) } },
        ],
      });
    }
    if (url.includes("/api/ce/activity")) {
      return jsonResponse({ tasks: [] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  let tick = 0;
  await assert.rejects(
    () =>
      waitForPullRequestAnalysis(config, fetchImpl, {
        sleep: async () => {
          tick += 1;
        },
        now: () => config.startedAtMs + tick * 2,
      }),
    /Timed out/,
  );
});

test("fetchOpenIssues paginates until all issues are collected", async () => {
  const config = baseConfig();
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (!url.includes("/api/issues/search")) {
      throw new Error(`unexpected ${url}`);
    }
    if (url.includes("&p=1")) {
      return jsonResponse({
        total: 3,
        issues: [
          {
            rule: "typescript:S1",
            severity: "MAJOR",
            component: `${config.projectKey}:src/a.ts`,
            line: 1,
            message: "one",
          },
          {
            rule: "typescript:S2",
            severity: "MINOR",
            component: `${config.projectKey}:src/b.ts`,
            line: 2,
            message: "two",
          },
        ],
      });
    }
    if (url.includes("&p=2")) {
      return jsonResponse({
        total: 3,
        issues: [
          {
            rule: "typescript:S3",
            severity: "MAJOR",
            component: `${config.projectKey}:src/c.ts`,
            line: 3,
            message: "three",
          },
        ],
      });
    }
    throw new Error(`unexpected page ${url}`);
  };

  const issues = await fetchOpenIssues(config, fetchImpl);
  assert.equal(issues.length, 3);
});

test("runSonarZeroIssuesGate passes with zero open issues", async () => {
  const config = baseConfig();
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes("/api/project_pull_requests/list")) {
      return jsonResponse({
        pullRequests: [
          { key: "17", commit: { sha: config.headSha }, analysisDate: "now" },
        ],
      });
    }
    if (url.includes("/api/ce/activity")) {
      return jsonResponse({ tasks: [] });
    }
    if (url.includes("/api/issues/search")) {
      return jsonResponse({ total: 0, issues: [] });
    }
    throw new Error(`unexpected ${url}`);
  };

  const code = await runSonarZeroIssuesGate(config, fetchImpl, {
    sleep: async () => undefined,
    now: () => config.startedAtMs,
  });
  assert.equal(code, 0);
});

test("runSonarZeroIssuesGate fails when issues remain", async () => {
  const config = baseConfig();
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes("/api/project_pull_requests/list")) {
      return jsonResponse({
        pullRequests: [
          { key: "17", commit: { sha: config.headSha }, analysisDate: "now" },
        ],
      });
    }
    if (url.includes("/api/ce/activity")) {
      return jsonResponse({ tasks: [] });
    }
    if (url.includes("/api/issues/search")) {
      return jsonResponse({
        total: 1,
        issues: [
          {
            rule: "typescript:S8786",
            severity: "MAJOR",
            component: `${config.projectKey}:src/x.ts`,
            line: 10,
            message: "Do not use namespace",
          },
        ],
      });
    }
    throw new Error(`unexpected ${url}`);
  };

  const code = await runSonarZeroIssuesGate(config, fetchImpl, {
    sleep: async () => undefined,
    now: () => config.startedAtMs,
  });
  assert.equal(code, 1);
});

test("analysisMatchesHead is case-insensitive", () => {
  assert.equal(
    analysisMatchesHead(
      { key: "1", commit: { sha: "AbCd".padEnd(40, "0") } },
      "abcd" + "0".repeat(36),
    ),
    true,
  );
});
