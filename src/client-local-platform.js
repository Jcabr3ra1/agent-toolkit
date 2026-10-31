// Platform selection is separate from authorization, ownership and process checks.
export const supportsLocalPosix = platform => platform === "darwin" || platform === "linux";

// A trusted test harness must identify its synthetic spawn explicitly. The normal
// native-client route retains its original macOS ARM64 restriction.
export const supportsDiagnosticHost = (platform, architecture, dependencies) =>
  platform === "darwin" && architecture === "arm64" ||
  supportsLocalPosix(platform) && dependencies.syntheticFixture === true && typeof dependencies.spawn === "function";

export const supportsPreferenceHost = (platform, source) =>
  platform === "darwin" || platform === "linux" && source === "synthetic";

export const supportsAuthHost = (platform, source) =>
  platform === "darwin" || platform === "linux" && source === "synthetic-fixture";
