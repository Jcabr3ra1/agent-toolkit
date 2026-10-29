import { randomBytes } from "node:crypto";
import { z } from "zod/v4";
import { createPeerReviewStore, PeerReviewError, PEER_LIMITS } from "./peer-review-store.js";

const AGENT = z.enum(["claude", "codex"]);
const ROOT = z.string().min(1).max(4096);
const BOUND = { taskId: z.string().uuid(), projectRoot: ROOT };
const REVIEW = { ...BOUND, reviewId: z.string().uuid() };
const TTL_MS = 20 * 60_000;
const MAX_PREVIEWS = 8;
const MAX_WAIT_MS = 60_000;
// Claude Code cannot show MCP elicitation; record why without exposing the request.
function sinDialogo(failure) {
  const motivo = String(failure?.code ?? failure?.name ?? "desconocido").replace(/[^\w.-]/gu, "").slice(0, 60);
  process.stderr.write(`agent-toolkit-mcp: diálogo de confirmación no disponible (${motivo}); se usa el permiso del cliente\n`);
  return true;
}
const REVIEWER = z.object({
  model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u),
  effort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]),
  reason: z.string().min(1).max(500)
}).strict();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Compact JSON: indentation is pure token cost for the model reading the result.
const result = value => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const error = message => ({ isError: true, content: [{ type: "text", text: message }] });

export const PEER_REVIEW_INSTRUCTIONS = "Para colaborar entre sesiones ya abiertas de Claude y Codex, usa start_collaboration y comparte el taskId y la raíz exacta del proyecto. publish_peer_context sustituye el contexto compartido con control de versión. preview_peer_review no envía nada; muestra su contenido completo y solicita aprobación directa antes de approve_peer_review. Incluye en reviewer el modelo y el esfuerzo que recomiendas para el revisor con un motivo breve, para que el usuario pueda cambiarlos en la otra terminal antes de aprobar; el MCP no cambia modelos. La aprobación envía un encargo a la bandeja compartida, no inicia una CLI ni un modelo. El receptor debe estar atendiendo wait_for_peer_handoff desde su propia sesión; no se despiertan ventanas inactivas. Antes de leer debe usar claim_peer_review, revisar solo los archivos aprobados en modo de lectura, sin pruebas ni ediciones, mostrar el trabajo en su terminal y devolver el informe con submit_peer_review. El principal consulta get_collaboration para recuperar los hallazgos y su vigencia. Si el cliente no ofrece diálogo de confirmación MCP (por ejemplo Claude Code), la aprobación de approve_peer_review es el aviso de permiso del propio cliente: llámalo solo después de que el usuario apruebe el encargo en el chat. Solo si el usuario pide expresamente trabajar sin aprobar cada encargo, crea la colaboración con autoReviews; el usuario lo confirma una sola vez y después el agente principal usa request_peer_review, hasta ese cupo, sin vista previa. El revisor nunca envía encargos automáticos. Sin taskId, wait_for_peer_handoff atiende todas las colaboraciones abiertas de esa raíz. No repitas wait_for_peer_handoff en bucle para esperas largas: cada llamada es un turno del modelo; usa el comando agent-toolkit-inbox wait, que espera sin usar ningún modelo. No te asignes un modelo o una identidad verificada: los roles y autores son declarados, y los permisos de la sesión nativa siguen siendo los suyos. No inicies bucles de espera sin que el usuario pida atender la bandeja. Nunca apruebes encargos por tu cuenta ni envíes un encargo como respuesta a otro de forma automática.";

// Tool results carry what the caller needs next, not the whole record: a collaboration grows to tens of KB
// (every prompt, hash and report so far) and each call would otherwise put all of it back in the model's context.
// `completo` on get_collaboration still returns the full record.
function reviewView(review, { prompt = false, report = true } = {}) {
  if (!review) return review;
  const { prompt: text, snapshot, review: saved, ...rest } = review;
  return { ...rest, ...(prompt && { prompt: text }), ...(snapshot && { files: snapshot.files.map(file => file.path), snapshotSha256: snapshot.sha256 }),
    // A report whose outcome is already recorded was verified: the list keeps its fingerprint, `completo` has the text.
    ...(saved && { review: report ? saved : { sha256: saved.sha256, savedAt: saved.savedAt, authorDeclared: saved.authorDeclared } }) };
}

function taskView(task, { reviews = false } = {}) {
  const { history, reviews: list, project, context, measurements = [], ...rest } = task;
  return { ...rest, project: project.name, projectRoot: project.root, ...(reviews && { context, reviews: list.map(review => reviewView(review, { report: !review.outcome })) }),
    reviewCount: list.length, measuredCalls: measurements.length };
}

export function registerPeerReviewTools(server, store = createPeerReviewStore(), { now = Date.now } = {}) {
  const previews = new Map();
  function tool(name, description, schema, operation, readOnly = false) {
    server.registerTool(name, { description, inputSchema: z.object(schema).strict(),
      annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false }
    }, async (args, context) => {
      try { return result(await operation(args, context)); }
      catch (failure) {
        return error(failure instanceof PeerReviewError ? failure.message : "La operación de colaboración no pudo completarse.");
      }
    });
  }

  tool("start_collaboration", "Crea una tarea compartida para cualquier repositorio y cualquiera de los agentes como principal. No llama modelos ni modifica el repositorio. Los roles son declarados, no identidad autenticada. Con autoReviews mayor que 0, pide una sola confirmación interactiva para que el principal envíe hasta ese número de encargos de solo lectura con request_peer_review, sin aprobar cada uno.", {
    projectRoot: ROOT, project: z.string().min(1).max(240), title: z.string().min(1).max(180),
    objective: z.string().min(1).max(4_000), primaryAgent: AGENT,
    scope: z.string().max(4_000).optional(), acceptance: z.string().max(4_000).optional(),
    context: z.string().max(PEER_LIMITS.contextBytes).optional(),
    autoReviews: z.number().int().min(0).max(PEER_LIMITS.autoReviews).optional()
  }, async (args, context) => {
    if (!args.autoReviews) return taskView(await store.startCollaboration(args));
    if (typeof context?.mcpReq?.elicitInput !== "function") {
      return { state: "blocked", created: false, message: "Este cliente MCP no ofrece confirmación interactiva. La colaboración automática no fue creada." };
    }
    const reviewer = args.primaryAgent === "claude" ? "codex" : "claude";
    const response = await context.mcpReq.elicitInput({
      message: [`Autoriza que ${args.primaryAgent} envíe a ${reviewer} hasta ${args.autoReviews} encargos de revisión sin pedir aprobación en cada uno.`,
        `Proyecto: ${args.projectRoot}`, `Título: ${args.title}`,
        `Solo ${args.primaryAgent} puede enviarlos; ${reviewer} no puede responder con encargos automáticos.`,
        "Cada encargo pide solo lectura de los archivos que indique el principal. No se inicia una CLI ni otro modelo, y los permisos nativos de cada sesión no cambian."
      ].join("\n\n"),
      requestedSchema: { type: "object", properties: { decision: { type: "string", enum: ["approve", "cancel"], title: "Decisión" } }, required: ["decision"] }
    }).catch(failure => {
      if (sinDialogo(failure)) return null;
      throw failure;
    });
    if (!response) {
      return { state: "blocked", created: false, message: "Este cliente MCP no ofrece diálogo de confirmación, que el modo automático necesita. Crea la colaboración sin autoReviews y aprueba cada encargo." };
    }
    if (response.action !== "accept" || response.content?.decision !== "approve") {
      return { state: "cancelled", created: false, message: "No se creó la colaboración automática." };
    }
    return taskView(await store.startCollaboration(args));
  });

  tool("get_collaboration", "Lee contexto, encargos e informes de una colaboración y su vigencia para los archivos actuales. Sin taskId lista las tareas abiertas en esa raíz; elige explícitamente si hay varias. Devuelve una vista compacta (sin prompts, huellas ni historial); completo=true devuelve el registro entero. No modifica el proyecto.", {
    projectRoot: ROOT, taskId: z.string().uuid().optional(), completo: z.boolean().optional()
  }, async ({ completo, ...args }) => args.taskId ? (completo ? store.getCollaboration(args) : taskView(await store.getCollaboration(args), { reviews: true }))
    : store.listCollaborations(args), true);

  tool("publish_peer_context", "Publica un contexto completo nuevo con autor declarado y expectedRevision; conserva historial limitado e invalida encargos pendientes anteriores. No envía una revisión ni ejecuta modelos.", {
    ...BOUND, author: AGENT, content: z.string().min(1).max(PEER_LIMITS.contextBytes), expectedRevision: z.number().int().min(1)
  }, async args => taskView(await store.publishContext(args)));

  tool("preview_peer_review", "Prepara un encargo de revisión de Claude a Codex o viceversa para una sesión ya abierta. Muestra el prompt íntegro, archivos y huellas. No envía ni ejecuta nada. Muestra la vista previa completa al usuario y espera aprobación explícita antes de approve_peer_review. reviewer recomienda modelo y esfuerzo para el revisor; es una recomendación declarada, no cambia la sesión receptora.", {
    ...BOUND, from: AGENT, to: AGENT, message: z.string().min(1).max(4_000),
    paths: z.array(z.string().min(1).max(512)).min(1).max(PEER_LIMITS.paths), reviewer: REVIEWER.optional()
  }, async args => {
    const prepared = await store.prepareReview(args);
    for (const [id, entry] of previews) if (entry.expires <= now()) previews.delete(id);
    while (previews.size >= MAX_PREVIEWS) previews.delete(previews.keys().next().value);
    const preview = { previewId: randomBytes(16).toString("hex"), confirmationCode: randomBytes(4).toString("hex").toUpperCase(),
      state: "ready", transport: "existing-session-inbox", ...prepared, expiresAt: new Date(now() + TTL_MS).toISOString(),
      deliveryNotice: "El receptor debe atender su bandeja. No se inicia ni se despierta una sesión. Los permisos de la sesión no cambian." };
    previews.set(preview.previewId, { preview, expires: now() + TTL_MS });
    return preview;
  });

  tool("approve_peer_review", "Después de la aprobación directa de la vista previa completa, solicita confirmación interactiva y publica un único encargo para la sesión receptora. Si el cliente no ofrece diálogo MCP, la aprobación es su propio aviso de permiso para esta herramienta y queda registrada como permiso-cliente. Bloquea vistas previas vencidas o cambios de contexto/archivos. No inicia modelos; no repitas automáticamente encargos fallidos.", {
    previewId: z.string().regex(/^[a-f0-9]{32}$/u), confirmationCode: z.string().regex(/^[A-F0-9]{8}$/u)
  }, async (args, context) => {
    const pending = previews.get(args.previewId);
    previews.delete(args.previewId);
    if (!pending || pending.expires <= now() || pending.preview.confirmationCode !== args.confirmationCode) {
      return Promise.reject(new PeerReviewError("revision"));
    }
    if (typeof context?.mcpReq?.elicitInput !== "function") {
      return { state: "blocked", sent: false, message: "Este cliente MCP no ofrece confirmación interactiva. El encargo no fue enviado." };
    }
    const preview = pending.preview;
    let method = "dialogo";
    const response = await context.mcpReq.elicitInput({
      message: ["Autoriza este encargo para una sesión ya abierta. No se iniciará una CLI ni otro modelo.",
        `Vista previa: ${preview.previewId}`, `De ${preview.from} a ${preview.to}`,
        ...(preview.reviewer ? [`Recomendado para ${preview.to}: modelo ${preview.reviewer.model}, esfuerzo ${preview.reviewer.effort}. ${preview.reviewer.reason}`,
          "Si quieres seguir la recomendación, cambia el modelo en la terminal del revisor antes de aprobar."] : []),
        `Proyecto: ${preview.projectRoot}`, `Versión del contexto: ${preview.contextRevision}`,
        `Huella de archivos: ${preview.snapshot.sha256}`, `Prompt completo (SHA-256 ${preview.promptSha256}):`, preview.prompt,
        "El receptor necesita estar atendiendo la bandeja. Solo se solicita lectura; sus permisos nativos no se modifican."
      ].join("\n\n"),
      requestedSchema: { type: "object", properties: { decision: { type: "string", enum: ["approve", "cancel"], title: "Decisión" } }, required: ["decision"] }
    }).catch(failure => {
      sinDialogo(failure);
      method = "permiso-cliente";
      return { action: "accept", content: { decision: "approve" } };
    });
    if (response.action !== "accept" || response.content?.decision !== "approve") {
      return { state: "cancelled", sent: false, message: "El encargo fue cancelado; no se envió al otro agente." };
    }
    if (pending.expires <= now()) throw new PeerReviewError("revision");
    const review = await store.dispatchReview(preview, { previewId: preview.previewId, method });
    return { state: "pending", sent: true, review: reviewView(review), approvedBy: method, startsModel: false };
  });

  tool("request_peer_review", "Envía directamente un encargo de revisión de solo lectura en una colaboración creada con autoReviews, sin vista previa ni aprobación por encargo. Solo lo admite el agente principal y hasta el cupo confirmado; en otro caso usa preview_peer_review. No inicia modelos ni CLIs.", {
    ...BOUND, from: AGENT, to: AGENT, message: z.string().min(1).max(4_000),
    paths: z.array(z.string().min(1).max(512)).min(1).max(PEER_LIMITS.paths), reviewer: REVIEWER.optional()
  }, async args => ({ state: "pending", sent: true, automatic: true, review: reviewView(await store.requestReview(args)), startsModel: false }));

  tool("wait_for_peer_handoff", "Espera hasta 60 segundos un encargo aprobado para agent. Sin taskId revisa todas las colaboraciones abiertas de esa raíz y devuelve el taskId del encargo. Con taskId y reviewId espera su informe o estado terminal. Lee el almacenamiento común, por lo que funciona entre procesos MCP distintos. Solo espera cuando el usuario pida atender la bandeja; no arranca modelos ni despierta sesiones inactivas. No leas archivos antes de claim_peer_review.", {
    projectRoot: ROOT, taskId: z.string().uuid().optional(), agent: AGENT, reviewId: z.string().uuid().optional(),
    waitMs: z.number().int().min(0).max(MAX_WAIT_MS).optional().default(15_000)
  }, async args => {
    const deadline = Date.now() + args.waitMs;
    while (true) {
      const { done, value } = await store.findHandoff(args);
      if (done) return { ...value, review: reviewView(value.review) };
      if (Date.now() >= deadline) return { ...value, review: reviewView(value.review), timedOut: true,
        message: "Sin un encargo nuevo o informe terminado. Esta espera no inicia otra llamada al modelo." };
      await sleep(Math.min(200, Math.max(1, deadline - Date.now())));
    }
  }, true);

  tool("claim_peer_review", "Reclama una sola vez un encargo aprobado dirigido a agent. Verifica la raíz y las huellas antes de devolver el prompt y un claimToken exclusivo para submit_peer_review. Guarda el comprobante en el contexto de esta sesión; no lo publiques en el informe. No ejecuta modelos.", {
    ...REVIEW, agent: AGENT
  }, async args => {
    const claimed = await store.claimReview(args);
    // The reviewer needs the prompt once, here; later calls never repeat it.
    return claimed.review ? { ...claimed, review: reviewView(claimed.review, { prompt: true }) } : claimed;
  });

  tool("submit_peer_review", "Guarda el informe de la sesión que reclamó el encargo. Requiere el claimToken y rechaza entregas duplicadas, canceladas o fuera del proyecto. Si cambiaron los archivos o el contexto, la revisión queda desactualizada y el informe no se guarda. No afirma identidad, modelo, permisos ni pruebas verificados.", {
    ...REVIEW, agent: AGENT, claimToken: z.string().regex(/^[a-f0-9]{64}$/u), content: z.string().min(1).max(PEER_LIMITS.reportBytes)
  }, async args => {
    const saved = await store.submitReview(args);
    // The submitter wrote the report; echoing it back only costs tokens.
    return saved.review ? { ...saved, review: { sha256: saved.review.sha256, savedAt: saved.review.savedAt } } : saved;
  });

  tool("record_review_outcome", "Después de verificar un informe, registra una sola vez el resultado del encargo: veredicto, hallazgos recibidos, cuántos se sostuvieron, nivel de la clasificación y configuración del principal. Solo lo registra el agente que envió el encargo. Sirve para medir qué modelo y esfuerzo rinden en cada nivel; no modifica el informe ni inicia modelos.", {
    ...REVIEW, agent: AGENT, verdict: z.enum(["aprobado", "aprobado_con_cambios", "requiere_cambios"]),
    findings: z.number().int().min(0).max(100), upheld: z.number().int().min(0).max(100),
    level: z.enum(["ligero", "normal", "exigente", "alto", "critico", "maximo"]).optional(),
    principal: REVIEWER.omit({ reason: true }).optional()
  }, args => store.recordOutcome(args));

  const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional();
  tool("record_peer_usage", "Registra una llamada medida de una colaboración. Usa un id estable por llamada: repetirlo no duplica consumo. Solo datos observados en el cliente o manuales; omite lo desconocido. No inventa precios ni ahorro; no lee conversaciones.", {
    ...BOUND, measurement: z.object({ id: z.string().min(1).max(100), agent: z.enum(["codex", "claude", "gemini"]),
      phase: z.enum(["planning", "implementation", "review", "research", "image", "analysis", "other"]),
      model: z.string().min(1).max(100), source: z.enum(["client-reported", "manual"]),
      inputTokens: counter, cacheReadTokens: counter, outputTokens: counter, totalTokens: counter, durationMs: counter,
      costUsd: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional()
    }).strict()
  }, args => store.recordUsage(args));

  tool("get_peer_consumption", "Consulta consumo declarado por colaboración, cobertura de cada contador y rondas. null significa desconocido, no cero. No acredita ahorro ni facturación.", {
    projectRoot: ROOT.optional()
  }, args => store.consumption(args), true);

  tool("cancel_peer_review", "Cancela un encargo pendiente o reclamado. Impide guardar una entrega posterior, pero no interrumpe la sesión nativa del receptor; detén esa sesión manualmente si continúa trabajando. No reintenta ni reasigna el encargo.", REVIEW, args => store.cancelReview(args));

  tool("close_collaboration", "Cierra una colaboración y cancela sus encargos activos. Conserva los informes para consulta. No interrumpe las sesiones de terminal ni modifica el proyecto.", BOUND, async args => taskView(await store.closeCollaboration(args)));
}
