import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Probe the current process and filesystem, without requesting extra privileges.
// A failed fixture or unexpected IO error must fail the tests, not hide coverage.
export function fileSymlinkSkipReason() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "agent-file-symlink-probe-")));
  const owner = fs.lstatSync(root);
  const target = path.join(root, "target"), link = path.join(root, "link");
  try {
    fs.writeFileSync(target, "file-symlink-probe\n");
    try {
      fs.symlinkSync(target, link, "file");
    } catch (error) {
      if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes(error.code)) throw error;
      return `File symlink capability probe failed with ${error.code}; this process/filesystem cannot create file symlinks.`;
    }
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.equal(fs.realpathSync(link), target);
    assert.equal(fs.readFileSync(link, "utf8"), "file-symlink-probe\n");
    return false;
  } finally {
    const current = fs.lstatSync(root);
    assert.ok(current.isDirectory() && !current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino,
      "symlink probe cleanup must remain in its owned temporary directory");
    // Never recursively remove a link or traverse its target during cleanup.
    if (fs.lstatSync(link, { throwIfNoEntry: false })) fs.unlinkSync(link);
    if (fs.lstatSync(target, { throwIfNoEntry: false })) fs.unlinkSync(target);
    fs.rmdirSync(root);
  }
}
