import test from "node:test";
import assert from "node:assert/strict";
import { supportsLocalPosix, supportsDiagnosticHost, supportsPreferenceHost, supportsAuthHost } from "../src/client-local-platform.js";

test("local client platform policy admits POSIX fixture infrastructure only on evaluated OS families", () => {
  for (const platform of ["darwin", "linux"]) assert.equal(supportsLocalPosix(platform), true);
  for (const platform of ["win32", "freebsd", undefined]) assert.equal(supportsLocalPosix(platform), false);
});
test("native diagnostics retain macOS ARM64 admission; Linux requires an explicit synthetic spawn dependency", () => {
  assert.equal(supportsDiagnosticHost("darwin", "arm64", {}), true);
  assert.equal(supportsDiagnosticHost("darwin", "x64", {}), false);
  assert.equal(supportsDiagnosticHost("darwin", "x64", { syntheticFixture: true, spawn() {} }), true);
  assert.equal(supportsDiagnosticHost("linux", "x64", {}), false);
  assert.equal(supportsDiagnosticHost("linux", "x64", { spawn() {} }), false);
  assert.equal(supportsDiagnosticHost("linux", "x64", { syntheticFixture: true }), false);
  assert.equal(supportsDiagnosticHost("linux", "x64", { syntheticFixture: true, spawn() {} }), true);
  assert.equal(supportsDiagnosticHost("win32", "arm64", { syntheticFixture: true, spawn() {} }), false);
});
test("Linux cannot authorize Core Foundation or a declared native auth client", () => {
  assert.equal(supportsPreferenceHost("darwin", "core-foundation-claim"), true);
  assert.equal(supportsPreferenceHost("linux", "synthetic"), true);
  assert.equal(supportsPreferenceHost("linux", "core-foundation-claim"), false);
  assert.equal(supportsPreferenceHost("win32", "synthetic"), false);
  assert.equal(supportsAuthHost("darwin", "native-client-declaration"), true);
  assert.equal(supportsAuthHost("linux", "synthetic-fixture"), true);
  assert.equal(supportsAuthHost("linux", "native-client-declaration"), false);
  assert.equal(supportsAuthHost("win32", "synthetic-fixture"), false);
});
