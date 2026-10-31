import { existsSync } from "node:fs";
import { supportsLocalPosix } from "../src/client-local-platform.js";

export const supported = supportsLocalPosix(process.platform) && typeof process.getuid === "function";
export const compiler = process.platform === "darwin"
  ? "/Library/Developer/CommandLineTools/usr/bin/clang"
  : ["/usr/bin/cc", "/usr/bin/clang"].find(file => existsSync(file)) ?? "/usr/bin/cc";
export const sdkArguments = process.platform === "darwin"
  ? ["-isysroot", "/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk"] : [];
