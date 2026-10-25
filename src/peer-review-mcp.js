import { randomBytes } from "node:crypto";
import { z } from "zod/v4";
import { createPeerReviewStore, PeerReviewError, PEER_LIMITS } from "./peer-review-store.js";

const AGENT = z.enum(["claude", "codex"]);
const ROOT = z.string().min(1).max(4096);
const BOUND = { taskId: z.string().uuid(), projectRoot: ROOT };
const REVIEW = { ...BOUND, reviewId: z.string().uuid() };
const TTL_MS = 20 * 60_000;
const MAX_PREVIEWS = 8;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const result = value => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const error = message => ({ isError: true, content: [{ type: "text", text: message }] });

export const PEER_REVIEW_INSTRUCTIONS = "Para colaborar entre sesiones ya abiertas de Claude y Codex, usa start_collaboration y comparte el taskId y la raíz exacta del proyecto. publish_peer_context sustituye el contexto compartido con control de versión. preview_peer_review no envía nada; muestra su contenido completo y solicita aprobación directa antes de approve_peer_review. La aprobación envía un encargo a la bandeja compartida, no inicia una CLI ni un modelo. El receptor debe estar atendiendo wait_for_peer_handoff desde su propia sesión; no se despiertan ventanas inactivas. Antes de leer debe usar claim_peer_review, revisar solo los archivos aprobados en modo de lectura, sin pruebas ni ediciones, mostrar el trabajo en su terminal y devolver el informe con submit_peer_review. El principal consulta get_collaboration para recuperar los hallazgos y su vigencia. No te asignes un modelo o una identidad verificada: los roles y autores son declarados, y los permisos de la sesión nativa siguen siendo los suyos. No inicies bucles de espera sin que el usuario pida atender la bandeja. Nunca apruebes encargos por tu cuenta ni envíes un encargo como respuesta a otro de forma automática.";

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

  tool("start_collaboration", "Crea una tarea compartida para cualquier repositorio y cualquiera de los agentes como principal. No llama modelos ni modifica el repositorio. Los roles son declarados, no identidad autenticada.", {
    projectRoot: ROOT, project: z.string().min(1).max(240), title: z.string().min(1).max(180),
    objective: z.string().min(1).max(4_000), primaryAgent: AGENT,
    scope: z.string().max(4_000).optional(), acceptance: z.string().max(4_000).optional(),
    context: z.string().max(PEER_LIMITS.contextBytes).optional()
  }, args => store.startCollaboration(args));

  tool("get_collaboration", "Lee contexto, encargos e informes de una colaboración y su vigencia para los archivos actuales. Sin taskId lista las tareas abiertas en esa raíz; elige explícitamente si hay varias. No modifica el proyecto.", {
    projectRoot: ROOT, taskId: z.string().uuid().optional()
  }, args => args.taskId ? store.getCollaboration(args) : store.listCollaborations(args), true);

  tool("publish_peer_context", "Publica un contexto completo nuevo con autor declarado y expectedRevision; conserva historial limitado e invalida encargos pendientes anteriores. No envía una revisión ni ejecuta modelos.", {
    ...BOUND, author: AGENT, content: z.string().min(1).max(PEER_LIMITS.contextBytes), expectedRevision: z.number().int().min(1)
  }, args => store.publishContext(args));

  tool("preview_peer_review", "Prepara un encargo de revisión de Claude a Codex o viceversa para una sesión ya abierta. Muestra el prompt íntegro, archivos y huellas. No envía ni ejecuta nada. Muestra la vista previa completa al usuario y espera aprobación explícita antes de approve_peer_review.", {
    ...BOUND, from: AGENT, to: AGENT, message: z.string().min(1).max(4_000),
    paths: z.array(z.string().min(1).max(512)).min(1).max(PEER_LIMITS.paths)
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

  tool("approve_peer_review", "Después de la aprobación directa de la vista previa completa, solicita confirmación interactiva y publica un único encargo para la sesión receptora. Bloquea clientes sin confirmación, vistas previas vencidas o cambios de contexto/archivos. No inicia modelos; no repitas automáticamente encargos fallidos.", {
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
    const response = await context.mcpReq.elicitInput({
      message: ["Autoriza este encargo para una sesión ya abierta. No se iniciará una CLI ni otro modelo.",
        `Vista previa: ${preview.previewId}`, `De ${preview.from} a ${preview.to}`,
        `Proyecto: ${preview.projectRoot}`, `Versión del contexto: ${preview.contextRevision}`,
        `Huella de archivos: ${preview.snapshot.sha256}`, `Prompt completo (SHA-256 ${preview.promptSha256}):`, preview.prompt,
        "El receptor necesita estar atendiendo la bandeja. Solo se solicita lectura; sus permisos nativos no se modifican."
      ].join("\n\n"),
      requestedSchema: { type: "object", properties: { decision: { type: "string", enum: ["approve", "cancel"], title: "Decisión" } }, required: ["decision"] }
    });
    if (response.action !== "accept" || response.content?.decision !== "approve") {
      return { state: "cancelled", sent: false, message: "El encargo fue cancelado; no se envió al otro agente." };
    }
    if (pending.expires <= now()) throw new PeerReviewError("revision");
    const review = await store.dispatchReview(preview, { previewId: preview.previewId });
    return { state: "pending", sent: true, review, startsModel: false };
  });

  tool("wait_for_peer_handoff", "Espera hasta 15 segundos un encargo aprobado para agent en esta colaboración. Con reviewId espera su informe o estado terminal. Lee el almacenamiento común, por lo que funciona entre procesos MCP distintos. Solo espera cuando el usuario pida atender la bandeja; no arranca modelos ni despierta sesiones inactivas. No leas archivos antes de claim_peer_review.", {
    ...BOUND, agent: AGENT, reviewId: z.string().uuid().optional(), waitMs: z.number().int().min(0).max(15_000).optional().default(15_000)
  }, async args => {
    const deadline = Date.now() + args.waitMs;
    while (true) {
      const task = await store.getCollaboration({ ...args, freshness: false });
      const request = args.reviewId ? task.reviews.find(review => review.id === args.reviewId) :
        task.reviews.find(review => review.to === args.agent && review.state === "pending");
      if (args.reviewId && !request) throw new PeerReviewError("missing");
      if (task.state === "closed" || request && (!args.reviewId || !["pending", "claimed"].includes(request.state))) {
        return { taskId: task.id, projectRoot: task.project.root, taskState: task.state, review: request ?? null };
      }
      if (Date.now() >= deadline) return { taskId: task.id, taskState: task.state, review: request ?? null,
        timedOut: true, message: "Sin un encargo nuevo o informe terminado. Esta espera no inicia otra llamada al modelo." };
      await sleep(Math.min(200, Math.max(1, deadline - Date.now())));
    }
  }, true);

  tool("claim_peer_review", "Reclama una sola vez un encargo aprobado dirigido a agent. Verifica la raíz y las huellas antes de devolver el prompt y un claimToken exclusivo para submit_peer_review. Guarda el comprobante en el contexto de esta sesión; no lo publiques en el informe. No ejecuta modelos.", {
    ...REVIEW, agent: AGENT
  }, args => store.claimReview(args));

  tool("submit_peer_review", "Guarda el informe de la sesión que reclamó el encargo. Requiere el claimToken y rechaza entregas duplicadas, canceladas o fuera del proyecto. Si cambiaron los archivos o el contexto, la revisión queda desactualizada y el informe no se guarda. No afirma identidad, modelo, permisos ni pruebas verificados.", {
    ...REVIEW, agent: AGENT, claimToken: z.string().regex(/^[a-f0-9]{64}$/u), content: z.string().min(1).max(PEER_LIMITS.reportBytes)
  }, args => store.submitReview(args));

  tool("cancel_peer_review", "Cancela un encargo pendiente o reclamado. Impide guardar una entrega posterior, pero no interrumpe la sesión nativa del receptor; detén esa sesión manualmente si continúa trabajando. No reintenta ni reasigna el encargo.", REVIEW, args => store.cancelReview(args));

  tool("close_collaboration", "Cierra una colaboración y cancela sus encargos activos. Conserva los informes para consulta. No interrumpe las sesiones de terminal ni modifica el proyecto.", BOUND, args => store.closeCollaboration(args));
}
