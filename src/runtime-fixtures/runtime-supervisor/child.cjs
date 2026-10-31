// Trusted test descendant. No network, project files or AI client.
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
