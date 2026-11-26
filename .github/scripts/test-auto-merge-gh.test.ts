import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ghEnv, withGhRepo } from "./auto-merge.ts";

const REPOSITORY = "osloer-industries/demo";

test("withGhRepo prepends -R for every gh subcommand shape used by auto-merge", () => {
  const cases: string[][] = [
    ["api", `repos/${REPOSITORY}/pulls/1/files`, "--paginate"],
    ["api", `repos/${REPOSITORY}/pulls/1/reviews`, "--paginate"],
    ["pr", "review", "1", "--approve", "--body", "Auto-approved for low-risk merge."],
    ["api", `repos/${REPOSITORY}/issues/1/labels`, "--paginate", "-q", ".[].name"],
    [
      "api",
      "--method",
      "POST",
      `repos/${REPOSITORY}/issues/1/labels`,
      "-f",
      "labels[]=release:major-hold",
    ],
    ["pr", "comment", "1", "--body", "Auto-merge withheld"],
    ["pr", "merge", "1", "--auto", "--squash"],
  ];
  for (const args of cases) {
    assert.deepEqual(withGhRepo(args, REPOSITORY), ["-R", REPOSITORY, ...args]);
  }
});

test("ghEnv sets GH_REPO and GH_TOKEN for non-checkout runners", () => {
  const env = ghEnv("test-token", REPOSITORY);
  assert.equal(env.GH_TOKEN, "test-token");
  assert.equal(env.GH_REPO, REPOSITORY);
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY);
});

test("auto-merge.ts routes all gh CLI calls through gh() (single spawnSync)", () => {
  const source = readFileSync(new URL("./auto-merge.ts", import.meta.url), "utf8");
  const spawnCalls = source.match(/spawnSync\(/g) ?? [];
  assert.equal(spawnCalls.length, 1, "only gh() may invoke spawnSync for the CLI");
  assert.match(source, /withGhRepo\(args, repository\)/);
  assert.match(source, /GH_REPO: repository/);
});