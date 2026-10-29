// Measurements are declared observations, never authenticated billing evidence.
export const USAGE_COUNTERS = Object.freeze(["inputTokens", "cacheReadTokens", "outputTokens", "totalTokens", "durationMs", "costUsd"]);
const KEYS = new Set(["id", "agent", "phase", "model", "source", ...USAGE_COUNTERS]);
export function normalizeMeasurement(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !KEYS.has(k)) ||
      typeof value.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(value.id) ||
      !["codex", "claude", "gemini"].includes(value.agent) ||
      !["planning", "implementation", "review", "research", "image", "analysis", "other"].includes(value.phase) ||
      typeof value.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(value.model) ||
      !["client-reported", "manual"].includes(value.source)) throw new Error("Medición inválida.");
  const result = Object.fromEntries(["id", "agent", "phase", "model", "source"].map(k => [k, value[k]]));
  for (const key of USAGE_COUNTERS) {
    const count = value[key] ?? null;
    if (count !== null && (typeof count !== "number" || !Number.isFinite(count) || count < 0 || count > Number.MAX_SAFE_INTEGER ||
      (key !== "costUsd" && !Number.isSafeInteger(count)))) throw new Error("Contador inválido.");
    result[key] = count;
  }
  if (USAGE_COUNTERS.every(key => result[key] === null)) throw new Error("La medición no contiene contadores.");
  return result;
}

export function summarizeMeasurements(records) {
  const counters = {};
  for (const key of USAGE_COUNTERS) {
    const values = records.map(r => r[key]).filter(v => typeof v === "number" && Number.isFinite(v));
    const sum = values.reduce((a, b) => a + b, 0);
    counters[key] = { known: values.length, missing: records.length - values.length,
      sum: values.length && sum <= Number.MAX_SAFE_INTEGER ? sum : null,
      complete: records.length > 0 && values.length === records.length && sum <= Number.MAX_SAFE_INTEGER };
  }
  return { calls: records.length, counters };
}

export function consumptionTable(report) {
  const rows = report.tasks.map(task => {
    const total = task.summary.counters.totalTokens;
    return `| ${task.taskId} | ${task.state} | ${task.summary.calls} | ${total.sum ?? "desconocido"}${total.sum !== null && !total.complete ? " (parcial)" : ""} |`;
  });
  return ["Consumo declarado por colaboración; caché no se suma a entrada ni al total.",
    "| Tarea | Estado | Llamadas medidas | Tokens totales conocidos |", "| --- | --- | --- | --- |", ...rows,
    "", ...Object.entries(report.summary.counters).map(([name, c]) => `${name}: ${c.sum ?? "desconocido"} (${c.known}/${report.summary.calls} llamadas con dato)`),
    "Cobertura: solo llamadas registradas; no incluye consumo oculto de sesiones. Ahorro no verificado.", ""].join("\n");
}
