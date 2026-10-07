// Controlled test writer only. Never launches an AI client or evaluates commands.
import fs from "node:fs";
import { createClientRuntimeStore } from "../../src/client-runtime-store.js";
import { schemas, NOW } from "./fixture.js";
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const run = createClientRuntimeStore(...schemas, data.configuration, {
  clock: () => Date.parse(NOW),
  checkpoint: async phase => {
    if (phase !== data.pauseAt) return;
    process.send({ type: "paused", phase });
    await new Promise(resolve => process.once("message", m => { if (m === "continue") resolve(); }));
  }
});
const result = await run(data.request); process.send({ type: "result", result });
process.disconnect();
