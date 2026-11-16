/** Unit tests for package-manager composite helper */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePackageManager,
  runPackageManagerCli,
} from "../actions/package-manager/package-manager.ts";

test("parsePackageManager accepts npm and bun", () => {
  assert.equal(parsePackageManager("npm"), "npm");
  assert.equal(parsePackageManager("bun"), "bun");
  assert.equal(parsePackageManager(" npm "), "npm");
});

test("parsePackageManager rejects unknown values", () => {
  assert.throws(() => parsePackageManager("pnpm"), /Invalid package-manager/);
  assert.throws(() => parsePackageManager(""), /Invalid package-manager/);
});

test("runPackageManagerCli validate prints manager", () => {
  const original = process.env.PACKAGE_MANAGER;
  process.env.PACKAGE_MANAGER = "npm";
  const written: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    written.push(chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  try {
    runPackageManagerCli(["validate"]);
    assert.equal(written.join(""), "package-manager: npm\n");
  } finally {
    process.stdout.write = originalWrite;
    process.env.PACKAGE_MANAGER = original;
  }
});

test("runPackageManagerCli rejects unknown command", () => {
  const original = process.env.PACKAGE_MANAGER;
  process.env.PACKAGE_MANAGER = "npm";
  try {
    assert.throws(
      () => runPackageManagerCli(["bogus"]),
      /Unknown command/,
    );
  } finally {
    process.env.PACKAGE_MANAGER = original;
  }
});