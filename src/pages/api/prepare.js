const STAGES = ["openai-plan", "claude-proposal", "claude-implementation", "openai-review"];
const FIELD_LIMITS = Object.freeze({
  title: 180,
  project: 240,
  objective: 4000,
  scope: 4000,
  acceptance: 4000,
  checks: 2000,
  plan: 16000,
  proposal: 24000,
  implementation: 16000
});
const encoder = new TextEncoder();

function validText(value, limit, required = false) {
  return typeof value === "string" && value.length <= limit && (!required || value.trim().length > 0) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function localOrigin(request) {
  const host = request.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/u.test(host)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && parsed.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}

function dataSection(label, value) {
  return `${label}:\n${JSON.stringify(value, null, 2)}`;
}

function makePrompt(stage, task, responses, applyAuthorized) {
  const brief = {
    title: task.title.trim(),
    project: task.project.trim(),
    mode: task.mode,
    objective: task.objective.trim(),
    scope: task.scope.trim(),
    acceptance: task.acceptance.trim(),
    checks: task.checks.trim()
  };
  const noNetwork = "El usuario hará este traspaso manualmente. No afirmes que enviaste el encargo ni invoques otros agentes, APIs o cuentas.";
  if (stage === "openai-plan") {
    return [
      "Actúa como Codex de OpenAI y planifica una tarea de Agent Toolkit.",
      "Lee primero las instrucciones vigentes del proyecto indicado. Devuelve un plan breve, ordenado y verificable, con rutas probables, criterios de aceptación y comprobaciones. Señala lo que no puedas confirmar y pregunta solo si falta una decisión que impide un plan seguro.",
      "No edites archivos, no ejecutes cambios y no publiques nada. El plan no concede permisos al agente que lo reciba después.",
      noNetwork,
      dataSection("Datos de la tarea", brief)
    ].join("\n\n");
  }
  if (stage === "claude-proposal") {
    return [
      "Actúa como Claude Code, agente de análisis y propuesta.",
      "Inspecciona las instrucciones y el estado real del proyecto antes de proponer. Contrasta el plan con el código. Devuelve una propuesta precisa con archivos y cambios previstos, riesgos, criterios y pruebas. En modo tutor, entrega un único paso explicado y espera al usuario.",
      "No edites archivos, no ejecutes cambios, no crees commits ni publiques. Si la base real no coincide con el plan, detente y explica la diferencia.",
      noNetwork,
      dataSection("Datos de la tarea", brief),
      dataSection("Plan de OpenAI", responses.plan)
    ].join("\n\n");
  }
  if (stage === "claude-implementation") {
    const authorization = task.mode === "autonomous" && applyAuthorized;
    return [
      "Actúa como Claude Code, escritor de la tarea acordada.",
      authorization
        ? "El usuario revisó la propuesta de Claude Code y marcó una autorización explícita para que la apliques. Verifica primero las instrucciones, la rama, el estado y que la propuesta siga vigente. Aplica únicamente esos cambios y ejecuta las comprobaciones acordadas. Si el alcance o la base difieren, detente sin escribir y explica el bloqueo."
        : task.mode === "tutor"
          ? "No edites archivos. Convierte la propuesta en un único paso explicado, con el código exacto para que el usuario lo escriba y una comprobación concreta. Espera a que el usuario confirme el resultado antes de continuar."
          : "No tienes autorización para editar archivos. Inspecciona la propuesta y devuelve un plan de aplicación, sin escribir ni ejecutar cambios.",
      "No crees commits, no hagas push, no publiques y no invoques servicios externos. Informa las comprobaciones ejecutadas y sus resultados; no declares pruebas en verde si no las ejecutaste.",
      noNetwork,
      dataSection("Datos de la tarea", brief),
      dataSection("Plan de OpenAI", responses.plan),
      dataSection("Propuesta de Claude Code", responses.proposal)
    ].join("\n\n");
  }
  return [
    "Actúa como Codex de OpenAI y revisor final de la tarea.",
    "Revisa el diff real y la evidencia disponible contra los criterios. Si no tienes acceso al repositorio o falta evidencia, indícalo como pendiente; no infieras que se aplicó o probó algo por el texto de entrega. No edites archivos.",
    "Devuelve hallazgos priorizados, criterios cumplidos o pendientes, comprobaciones que faltan y una conclusión breve. No crees commits ni publiques.",
    noNetwork,
    dataSection("Datos de la tarea", brief),
    dataSection("Plan de OpenAI", responses.plan),
    dataSection("Propuesta de Claude Code", responses.proposal),
    dataSection("Implementación de Claude Code", responses.implementation)
  ].join("\n\n");
}

export const prerender = false;

export async function POST({ request }) {
  if (!localOrigin(request)) return jsonResponse({ error: "local-only" }, 403);
  if (request.method !== "POST" || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonResponse({ error: "invalid-request" }, 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 98304) return jsonResponse({ error: "request-too-large" }, 413);
  let body;
  try {
    const text = await request.text();
    if (encoder.encode(text).byteLength > 98304) return jsonResponse({ error: "request-too-large" }, 413);
    body = JSON.parse(text);
  } catch {
    return jsonResponse({ error: "invalid-json" }, 400);
  }
  if (!isRecord(body) || !STAGES.includes(body.stage) || !isRecord(body.task) || !isRecord(body.responses)) {
    return jsonResponse({ error: "invalid-input" }, 400);
  }
  const task = body.task;
  if (!validText(task.title, FIELD_LIMITS.title, true) || !validText(task.project, FIELD_LIMITS.project, true) ||
    !["tutor", "autonomous"].includes(task.mode) || !validText(task.objective, FIELD_LIMITS.objective, true) ||
    !validText(task.scope, FIELD_LIMITS.scope) || !validText(task.acceptance, FIELD_LIMITS.acceptance, true) ||
    !validText(task.checks, FIELD_LIMITS.checks) || !validText(body.responses.plan ?? "", FIELD_LIMITS.plan) ||
    !validText(body.responses.proposal ?? "", FIELD_LIMITS.proposal) ||
    !validText(body.responses.implementation ?? "", FIELD_LIMITS.implementation) ||
    typeof body.applyAuthorized !== "boolean") return jsonResponse({ error: "invalid-input" }, 400);
  if (STAGES.indexOf(body.stage) >= 1 && !body.responses.plan?.trim() ||
    STAGES.indexOf(body.stage) >= 2 && !body.responses.proposal?.trim() ||
    STAGES.indexOf(body.stage) >= 3 && !body.responses.implementation?.trim()) return jsonResponse({ error: "missing-handoff" }, 400);

  const prompt = makePrompt(body.stage, task, body.responses, body.applyAuthorized);
  if (encoder.encode(prompt).byteLength > 98304) return jsonResponse({ error: "prompt-too-large" }, 413);
  return jsonResponse({ stage: body.stage, prompt, externalCalls: false, savedOnServer: false });
}
