// Synthetic access data only; never contacts a provider or reads an account.
const mode = process.argv[2];
const hang = () => setInterval(() => {}, 1000);
if (mode === "silent") hang();
else if (mode === "ignore-term") { process.on("SIGTERM", () => {}); hang(); }
else if (mode === "overflow") { process.stdout.write(Buffer.alloc(40000, 120)); hang(); }
else if (mode === "stderr") { process.stderr.write(Buffer.alloc(40000, 120)); hang(); }
else if (mode === "utf8") process.stdout.write(Buffer.from([0xff]));
else if (mode === "duplicate") process.stdout.write('{"loggedIn":true,"loggedIn":false}\n');
else if (mode === "failure") { process.stderr.write("synthetic-private-error"); process.exitCode = 4; }
else if (mode === "api") process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: "api_key", subscriptionType: null }) + "\n");
else process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro", email: "synthetic-private@example.invalid", configDirectory: "/synthetic-private", ignored: "synthetic-private-token" }) + "\n");
