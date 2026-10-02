import { createHash } from "node:crypto";

import Ajv2020 from "ajv/dist/2020.js";

const SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-model-selection.schema.json";
const SELECTOR_VERSION = "1.0.0";
const DOCUMENTS = ["request", "catalog", "policy"];
const REQUIRED_REQUEST_FIELDS = [
  "provider", "client", "category", "difficulty", "risk",
  "requirements", "authorizationContext", "history", "availability"
];
const REQUIRED_REQUIREMENTS = [
  "tools", "inputModalities", "outputFormats", "contextTokens", "riskFactors"
];
const ROLE_ACTIONS = {
  coordinator: ["read"],
  reviewer: ["read", "verify"],
  tutor: ["read", "explain"],
  proposer: ["read", "propose"],
  executor: ["read", "apply", "verify"]
};
const CATEGORY_ACTIONS = {
  documentation: ["read"],
  tutoring: ["explain"],
  proposal: ["propose"],
  diagnostic: ["read"],
  application: ["apply", "verify"],
  review: ["verify"]
};

/**
 * Initialize with the trusted, packaged schema as JSON data. The caller loads
 * it; neither initialization nor recommendation reads files or launches clients.
 * Recommendations describe declared permission/evidence, never authenticate it.
 */
export function createModelSelector(schema) {
  const schemaCopy = copyJson(schema);
  if (schemaCopy.$id !== SCHEMA_ID) throw new Error("Unsupported selector schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: isUtcTimestamp });
  ajv.addSchema(schemaCopy);
  const validators = Object.fromEntries(DOCUMENTS.map((name) => [
    name, ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/${name}` })
  ]));
  const schemaSha256 = hashJson(schemaCopy);

  return function selectModel(input) {
    let data;
    try {
      data = copyJson(input);
    } catch {
      return emptyReport(schemaSha256, "invalid", "non-json-input");
    }
    if (!data || Array.isArray(data) || typeof data !== "object" ||
        Object.keys(data).some((key) => !DOCUMENTS.includes(key))) {
      return emptyReport(schemaSha256, "invalid", "invalid-envelope");
    }

    const report = emptyReport(schemaSha256);
    let requestValid = false;
    for (const name of DOCUMENTS) {
      const value = data[name];
      report.audit[`${name}Sha256`] = value === undefined ? null : hashJson(value);
      const valid = validators[name](value);
      if (name === "request") requestValid = valid;
      if (!valid) {
        // Do not echo input values or unknown property names in validation errors.
        report.issues.push({ code: "schema-invalid", document: name });
      }
    }
    if (requestValid) {
      const { projectId, taskId, revision, role, mode } = data.request;
      report.identity = { projectId, taskId, revision, role, mode };
    }
    if (report.issues.length) return finish(report, "invalid", "invalid-structure");

    const { request, catalog, policy } = data;
    report.audit.catalog = { id: catalog.catalogId, revision: catalog.revision };
    report.audit.policy = { id: policy.policyId, revision: policy.revision };
    report.constraints = {
      provider: request.provider ?? null,
      client: request.client ?? null,
      mode: request.mode,
      authorizationContext: request.authorizationContext ?? null,
      history: request.history ?? null,
      maxCorrectionRounds: policy.maxCorrectionRounds,
      maxFutureExecutions: policy.maxFutureExecutions,
      maxFutureDurationSeconds: policy.maxFutureDurationSeconds,
      accessType: policy.accessType,
      execution: policy.execution
    };
    const profiles = new Map(catalog.profiles.map((profile) => [profile.profileId, profile]));
    report.issues = semanticIssues(request, catalog, policy, profiles);
    if (report.issues.length) return finish(report, "invalid", "invalid-references-or-data");

    report.missing = REQUIRED_REQUEST_FIELDS.filter((key) => request[key] === undefined);
    if (request.requirements) {
      report.missing.push(...REQUIRED_REQUIREMENTS
        .filter((key) => request.requirements[key] === undefined)
        .map((key) => `requirements.${key}`));
    }
    if (request.escalation && request.history && !request.history.previousProfileId) {
      report.missing.push("history.previousProfileId");
    }
    report.missing.sort(compareText);
    if (report.missing.length) return finish(report, "needs-info", "missing-task-information");

    const blocked = taskBlocks(request, policy);
    if (blocked.length) {
      report.reasons.push(...blocked);
      return finish(report, "blocked");
    }
    const route = policy.routes.find((entry) => entry.role === request.role &&
      entry.provider === request.provider && entry.client === request.client);
    if (!route || !route.modes.includes(request.mode) ||
        !route.categories.includes(request.category)) {
      return finish(report, "blocked", "route-not-permitted");
    }
    const priorities = new Map(route.priorities.map((entry) => [entry.profileId, entry]));
    const availability = new Map(request.availability.map((entry) => [entry.profileId, entry]));
    const previous = request.history.previousProfileId;
    if (request.escalation && !priorities.has(previous)) {
      return finish(report, "blocked", "previous-profile-not-in-route");
    }

    const candidates = [];
    for (const profile of [...catalog.profiles].sort((a, b) => compareText(a.profileId, b.profileId))) {
      const priority = priorities.get(profile.profileId);
      const record = availability.get(profile.profileId);
      const reasons = profileExclusions(profile, priority, record, request, policy);
      if (request.escalation && priority && priority.rank <= priorities.get(previous).rank) {
        reasons.push("not-higher-approved-priority");
      }
      if (reasons.length) {
        report.excluded.push({ profileId: profile.profileId, reasons });
      } else {
        candidates.push({ profile, priority, record });
      }
    }
    candidates.sort((a, b) => a.priority.rank - b.priority.rank ||
      compareText(a.profile.profileId, b.profile.profileId));
    const chosen = request.explicitProfileId
      ? candidates.find((entry) => entry.profile.profileId === request.explicitProfileId)
      : candidates[0];
    if (!chosen) {
      return finish(report, "blocked", request.explicitProfileId
        ? "explicit-choice-not-admissible" : "no-admissible-profile");
    }
    const { profile, priority, record } = chosen;
    const evaluation = matchingEvaluations(profile, request);
    report.recommendation = {
      profileId: profile.profileId,
      provider: profile.provider,
      client: profile.client,
      requestedModel: profile.requestedModel,
      versionPolicy: profile.versionPolicy,
      effort: priority.effort ?? null,
      rank: priority.rank,
      evaluationEvidenceRefs: [...new Set(evaluation.flatMap((item) => item.evidenceRefs))].sort(compareText),
      availabilityEvidence: record
    };
    if (request.escalation) report.reasons.push("quality-escalation-with-declared-evidence");
    return finish(report, "recommended", request.explicitProfileId
      ? "explicit-compatible-choice" : "lowest-admissible-priority");
  };
}

function semanticIssues(request, catalog, policy, profiles) {
  const issues = [];
  const add = (code, document) => issues.push({ code, document });
  if (hasDuplicates(catalog.profiles.map((entry) => entry.profileId))) add("duplicate-profile-id", "catalog");
  if (policy.catalogId !== catalog.catalogId || policy.catalogRevision !== catalog.revision) {
    add("catalog-version-mismatch", "policy");
  }
  const now = Date.parse(request.evaluationTime);
  for (const profile of catalog.profiles) {
    if (Date.parse(profile.reviewedAt) > now) add("profile-reviewed-in-future", "catalog");
    const declared = profile.declaredCapabilities;
    const verified = profile.verifiedCapabilities;
    if (["tools", "inputModalities", "outputFormats"].some((key) =>
      verified[key].some((value) => !declared[key].includes(value))) ||
      (declared.maxContextTokens !== null && verified.maxContextTokens !== null &&
       verified.maxContextTokens > declared.maxContextTokens)) {
      add("inconsistent-verified-capabilities", "catalog");
    }
  }
  if (hasDuplicates(policy.routes.map((entry) => JSON.stringify([entry.role, entry.provider, entry.client])))) {
    add("duplicate-route", "policy");
  }
  for (const route of policy.routes) {
    if (hasDuplicates(route.priorities.map((entry) => entry.profileId))) add("duplicate-priority", "policy");
    for (const priority of route.priorities) {
      const profile = profiles.get(priority.profileId);
      if (!profile) { add("unknown-priority-profile", "policy"); continue; }
      if (profile.provider !== route.provider || profile.client !== route.client) add("priority-client-mismatch", "policy");
      if (priority.effort !== undefined && !profile.effortOptions.includes(priority.effort)) add("unsupported-effort", "policy");
    }
  }
  if (request.availability) {
    if (hasDuplicates(request.availability.map((entry) => entry.profileId))) add("duplicate-availability", "request");
    for (const item of request.availability) {
      if (!profiles.has(item.profileId)) add("unknown-availability-profile", "request");
      else if (!sameClient(profiles.get(item.profileId), request)) add("availability-client-mismatch", "request");
    }
  }
  for (const id of [request.explicitProfileId, request.history?.previousProfileId]) {
    if (id === undefined) continue;
    if (!profiles.has(id)) add("unknown-request-profile", "request");
    else if (!sameClient(profiles.get(id), request)) add("request-profile-client-mismatch", "request");
  }
  if (request.risk === "low" && request.requirements?.riskFactors?.length) add("risk-contradiction", "request");
  if (request.history?.previousProfileId && request.history.executionsUsed === 0) add("history-contradiction", "request");
  if (request.mode === "autonomous" && request.history?.correctionRound > 0 && request.history.executionsUsed === 0) {
    add("history-contradiction", "request");
  }
  return uniqueIssues(issues);
}

function taskBlocks(request, policy) {
  const reasons = [];
  const actions = new Set(request.authorizationContext.allowedActions);
  if ([...ROLE_ACTIONS[request.role], ...CATEGORY_ACTIONS[request.category]]
    .some((action) => !actions.has(action))) reasons.push("insufficient-declared-actions");
  if ((request.role === "executor") !== (request.category === "application")) reasons.push("role-category-conflict");
  if (request.role === "executor" && request.authorizationContext.activeWriter !== "authorized-executor") {
    reasons.push("executor-is-not-active-writer");
  }
  if (request.history.executionsUsed >= policy.maxFutureExecutions) reasons.push("execution-limit-reached");
  if (request.history.durationUsedSeconds >= policy.maxFutureDurationSeconds) reasons.push("duration-limit-reached");
  if (request.mode === "autonomous" && request.history.correctionRound >= policy.maxCorrectionRounds) {
    reasons.push("correction-limit-reached");
  }
  if (request.escalation && request.escalation.reason !== "quality") reasons.push("non-quality-failure");
  return reasons;
}

function profileExclusions(profile, priority, record, request, policy) {
  const reasons = [];
  if (!priority || !sameClient(profile, request)) reasons.push("profile-not-permitted");
  if (profile.status !== "approved") reasons.push("profile-not-approved");
  if (!matchingEvaluations(profile, request).length) reasons.push("scope-not-evaluated");
  const verified = profile.verifiedCapabilities;
  for (const key of ["tools", "inputModalities", "outputFormats"]) {
    if (request.requirements[key].some((value) => !verified[key].includes(value))) reasons.push(`${key}-not-verified`);
  }
  if (verified.maxContextTokens === null || verified.maxContextTokens < request.requirements.contextTokens) {
    reasons.push("context-not-verified");
  }
  if (!record || record.status !== "available") reasons.push("availability-not-declared");
  else {
    const age = (Date.parse(request.evaluationTime) - Date.parse(record.checkedAt)) / 1000;
    if (age < 0) reasons.push("availability-in-future");
    else if (age > policy.availabilityMaxAgeSeconds) reasons.push("availability-expired");
  }
  return reasons;
}

function matchingEvaluations(profile, request) {
  return profile.evaluations.filter((entry) => entry.role === request.role &&
    entry.category === request.category && entry.difficulties.includes(request.difficulty) &&
    entry.risks.includes(request.risk));
}

function sameClient(profile, request) {
  return (request.provider === undefined || profile.provider === request.provider) &&
    (request.client === undefined || profile.client === request.client);
}

function emptyReport(schemaSha256, state = null, reason = null) {
  const report = {
    schemaVersion: "1.0.0", selectorVersion: SELECTOR_VERSION, state, executed: false,
    identity: null, recommendation: null, constraints: null,
    observedModels: [], modelVerification: "unknown",
    reasons: [], issues: [], missing: [], excluded: [],
    audit: { schemaSha256, requestSha256: null, catalogSha256: null, policySha256: null, catalog: null, policy: null },
    nextAction: null
  };
  return state ? finish(report, state, reason) : report;
}

function finish(report, state, reason) {
  report.state = state;
  if (reason) report.reasons.push(reason);
  report.nextAction = {
    recommended: "review-recommendation-and-select-manually",
    "needs-info": "complete-listed-information",
    blocked: "resolve-block-without-changing-permissions",
    invalid: "correct-input-documents"
  }[state];
  return report;
}

function uniqueIssues(issues) {
  return [...new Map(issues.map((issue) => [`${issue.document}:${issue.code}`, issue])).values()]
    .sort((a, b) => compareText(`${a.document}:${a.code}`, `${b.document}:${b.code}`));
}

function hasDuplicates(values) { return new Set(values).size !== values.length; }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function isUtcTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value.replace(/Z$/, ".000Z");
}

function hashJson(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

// Accept only bounded JSON data; never invoke getters or toJSON on task inputs.
function copyJson(value) {
  const ancestors = new Set();
  let nodes = 0;
  let textUnits = 0;
  function visit(item, depth) {
    if (++nodes > 30000 || depth > 64) throw new Error("JSON limit");
    if (typeof item === "string") {
      textUnits += item.length;
      if (textUnits > 2000000) throw new Error("JSON limit");
      return item;
    }
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || ancestors.has(item)) throw new Error("Non-JSON data");
    const array = Array.isArray(item);
    if (array && item.length > 256) throw new Error("JSON limit");
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error("Non-JSON object");
    if (Object.getOwnPropertySymbols(item).length) throw new Error("Non-JSON keys");
    const keys = Object.getOwnPropertyNames(item).filter((key) => !array || key !== "length");
    if (array && (keys.length !== item.length || keys.some((key, index) => key !== String(index)))) throw new Error("Non-JSON array");
    if (keys.length > 30000) throw new Error("JSON limit");
    ancestors.add(item);
    const result = array ? [] : {};
    for (const key of keys) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe JSON key");
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !("value" in descriptor)) throw new Error("Non-JSON property");
      textUnits += key.length;
      if (textUnits > 2000000) throw new Error("JSON limit");
      result[key] = visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
    return result;
  }
  return visit(value, 0);
}
