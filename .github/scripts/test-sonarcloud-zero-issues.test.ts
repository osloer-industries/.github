/** Unit tests for sonarcloud-zero-issues.ts */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analysisMatchesHead,
  fetchOpenIssues,
  fetchOpenIssuesWhenSettled,
  findCeTaskIdForPullRequest,
  hasInProgressCeForPullRequest,
  issuesSearchPath,
  normalizeCeStatus,
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
    issuesSettlePolls: 2,
    issuesMinPollsBeforeSettle: 3,
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

test("hasInProgressCeForPullRequest detects pending tasks", () => {
  assert.equal(
    hasInProgressCeForPullRequest(
      [{ pullRequest: "17", status: "IN_PROGRESS" }],
      17,
    ),
    true,
  );
  assert.equal(
    hasInProgressCeForPullRequest([{ pullRequest: "17", status: "SUCCESS" }], 17),
    false,
  );
});

test("waitForPullRequestAnalysis waits when compute engine is still running", async () => {
  const config = baseConfig();
  let listCalls = 0;
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes("/api/project_pull_requests/list")) {
      listCalls += 1;
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
      if (listCalls < 2) {
        return jsonResponse({
          tasks: [{ pullRequest: "17", status: "IN_PROGRESS" }],
        });
      }
      return jsonResponse({ tasks: [{ pullRequest: "17", status: "SUCCESS" }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  let tick = 0;
  const result = await waitForPullRequestAnalysis(config, fetchImpl, {
    sleep: async () => {
      tick += 1;
    },
    now: () => config.startedAtMs + tick * 2,
  });
  assert.equal(result.key, "17");
  assert.equal(listCalls >= 2, true);
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
      return jsonResponse({
        tasks: [
          {
            id: "ce-abc",
            pullRequest: "17",
            status: "SUCCESS",
            type: "REPORT",
          },
        ],
      });
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

test("waitForPullRequestAnalysis polls ce/task when ce-task-id is configured", async () => {
  const config = baseConfig({ ceTaskId: "ce-explicit" });
  let ceTaskCalls = 0;
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes("/api/project_pull_requests/list")) {
      return jsonResponse({
        pullRequests: [{ key: "17", commit: { sha: config.headSha } }],
      });
    }
    if (url.includes("/api/ce/activity")) {
      return jsonResponse({ tasks: [] });
    }
    if (url.includes("/api/ce/task?id=ce-explicit")) {
      ceTaskCalls += 1;
      if (ceTaskCalls < 2) {
        return jsonResponse({ task: { id: "ce-explicit", status: "IN_PROGRESS" } });
      }
      return jsonResponse({ task: { id: "ce-explicit", status: "SUCCESS" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  let tick = 0;
  const result = await waitForPullRequestAnalysis(config, fetchImpl, {
    sleep: async () => {
      tick += 1;
    },
    now: () => config.startedAtMs + tick * 2,
  });
  assert.equal(result.key, "17");
  assert.equal(ceTaskCalls >= 2, true);
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

test("fetchOpenIssuesWhenSettled keeps polling when the issue index grows", async () => {
  const config = baseConfig({ deadlineMs: Date.now() + 60_000 });
  let issueCalls = 0;
  const fetchImpl: FetchLike = async (input) => {
    const url = String(input);
    if (!url.includes("/api/issues/search")) {
      throw new Error(`unexpected ${url}`);
    }
    issueCalls += 1;
    if (issueCalls < 3) {
      return jsonResponse({ total: 0, issues: [] });
    }
    return jsonResponse({
      total: 1,
      issues: [
        {
          key: "issue-1",
          rule: "typescript:S1",
          severity: "MAJOR",
          component: `${config.projectKey}:a.ts`,
          line: 1,
          message: "one",
        },
      ],
    });
  };

  let tick = 0;
  const issues = await fetchOpenIssuesWhenSettled(config, fetchImpl, {
    sleep: async () => {
      tick += 1;
    },
    now: () => config.startedAtMs + tick * 2,
  });
  assert.equal(issues.length, 1);
  assert.equal(issueCalls >= 4, true);
});

test("runSonarZeroIssuesGate passes with zero open issues", async () => {
  const config = baseConfig({ deadlineMs: Date.now() + 60_000 });
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
      return jsonResponse({
        tasks: [{ id: "ce-1", pullRequest: "17", status: "SUCCESS", type: "REPORT" }],
      });
    }
    if (url.includes("/api/issues/search")) {
      return jsonResponse({ total: 0, issues: [] });
    }
    throw new Error(`unexpected ${url}`);
  };

  let tick = 0;
  const code = await runSonarZeroIssuesGate(config, fetchImpl, {
    sleep: async () => {
      tick += 1;
    },
    now: () => config.startedAtMs + tick * 2,
  });
  assert.equal(code, 0);
});

test("runSonarZeroIssuesGate fails when issues remain", async () => {
  const config = baseConfig({ deadlineMs: Date.now() + 60_000 });
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
      return jsonResponse({
        tasks: [{ id: "ce-2", pullRequest: "17", status: "SUCCESS", type: "REPORT" }],
      });
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

  let tick = 0;
  const code = await runSonarZeroIssuesGate(config, fetchImpl, {
    minPollsBeforeSettle: 1,
    settlePolls: 1,
    sleep: async () => {
      tick += 1;
    },
    now: () => config.startedAtMs + tick * 2,
  });
  assert.equal(code, 1);
});

test("issuesSearchPath scopes SonarCloud PR issues to the organization", () => {
  const path = issuesSearchPath(
    {
      organization: "osloer-industries",
      projectKey: "osloer-industries_demo",
      pullRequestNumber: 51,
    },
    1,
    500,
  );
  assert.match(path, /organization=osloer-industries/);
  assert.match(path, /resolved=false/);
  assert.match(path, /issueStatuses=OPEN,CONFIRMED/);
  assert.match(path, /pullRequest=51/);
});

test("findCeTaskIdForPullRequest picks pull-request scoped task ids", () => {
  const id = findCeTaskIdForPullRequest(
    [
      { id: "other", pullRequest: "18", status: "SUCCESS" },
      { id: "ce-match", pullRequest: "17", status: "IN_PROGRESS" },
    ],
    17,
  );
  assert.equal(id, "ce-match");
  assert.equal(normalizeCeStatus("success"), "SUCCESS");
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
