// Remains in its parent's process group; no detached grandchildren or external IO.
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
