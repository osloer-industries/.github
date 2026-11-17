/** Unit tests for dependency-diff-audit.ts */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FAIL_RANK,
  collectAdvisories,
  findNewlyIntroducedHighCritical,
  parseAuditJson,
  rank,
} from "./dependency-diff-audit.ts";

test("parseAuditJson parses valid audit JSON", () => {
  assert.deepEqual(parseAuditJson('{"vulnerabilities":{}}', "test"), {
    vulnerabilities: {},
  });
});

test("parseAuditJson throws on empty output", () => {
  assert.throws(() => parseAuditJson("", "test"), /no JSON/);
  assert.throws(() => parseAuditJson("   ", "test"), /no JSON/);
});

test("parseAuditJson throws on invalid JSON", () => {
  assert.throws(() => parseAuditJson("{not-json", "test"), /invalid JSON/);
});

test("collectAdvisories keys advisories by URL and respects via severity", () => {
  const audit = {
    vulnerabilities: {
      "left-pad": {
        severity: "moderate",
        via: [
          {
            source: 999,
            name: "left-pad",
            severity: "high",
            url: "https://example.com/advisories/999",
            title: "Prototype pollution",
          },
          "lodash",
        ],
      },
    },
  };
  const map = collectAdvisories(audit);
  assert.equal(map.size, 1);
  assert.deepEqual(map.get("https://example.com/advisories/999"), {
    severity: "high",
    name: "left-pad",
    title: "Prototype pollution",
  });
});

test("findNewlyIntroducedHighCritical ignores advisories already on base and below fail rank", () => {
  const base = collectAdvisories({
    vulnerabilities: {
      kept: {
        severity: "high",
        via: [{ url: "https://example.com/a/1", title: "Kept", severity: "high" }],
      },
    },
  });
  const head = collectAdvisories({
    vulnerabilities: {
      kept: {
        severity: "high",
        via: [{ url: "https://example.com/a/1", title: "Kept", severity: "high" }],
      },
      newMod: {
        severity: "moderate",
        via: [{ url: "https://example.com/a/2", title: "New mod", severity: "moderate" }],
      },
      newHigh: {
        severity: "high",
        via: [{ url: "https://example.com/a/3", title: "New high", severity: "high" }],
      },
    },
  });

  const found = findNewlyIntroducedHighCritical(head, base, FAIL_RANK);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.key, "https://example.com/a/3");
  assert.equal(found[0]?.severity, "high");
});

test("findNewlyIntroducedHighCritical includes critical newly introduced advisories", () => {
  const head = collectAdvisories({
    vulnerabilities: {
      pkg: {
        severity: "critical",
        via: [{ url: "https://example.com/a/c", title: "Critical", severity: "critical" }],
      },
    },
  });
  const found = findNewlyIntroducedHighCritical(head, new Map(), FAIL_RANK);
  assert.equal(found.length, 1);
  assert.ok(rank(found[0]?.severity ?? "") >= FAIL_RANK);
});