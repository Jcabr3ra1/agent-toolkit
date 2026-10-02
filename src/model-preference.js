import Ajv2020 from "ajv/dist/2020.js";

const SCHEMA_ID = "https://agent-toolkit.local/schemas/agent-model-preference.schema.json";
const DOCUMENTS = ["request", "catalog", "policy"];

// Internal extension: helpers and both schemas come from the trusted factory.
// This module performs no file, network, account or client operations.
export function createPreferenceSelector(baseSchema, schema, helpers) {
  const {
    hashJson, isUtcTimestamp, emptyReport, finish, semanticIssues, taskBlocks,
    profileExclusions, matchingEvaluations, compareText, uniqueIssues,
    hasDuplicates, REQUIRED_REQUEST_FIELDS, REQUIRED_REQUIREMENTS
  } = helpers;
  if (schema.$id !== SCHEMA_ID) throw new Error("Unsupported preference schema");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: isUtcTimestamp });
  ajv.addSchema(baseSchema);
  ajv.addSchema(schema);
  const validators = Object.fromEntries(DOCUMENTS.map((name) => [
    name, ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/${name}` })
  ]));
  const schemaSha256 = hashJson(schema);
  const baseSchemaSha256 = hashJson(baseSchema);
  const comboKey = (profileId, effort) => JSON.stringify([profileId, effort]);
  const scopeKey = (rule) => JSON.stringify([rule.category, rule.difficulty, rule.risk]);
  const sameScope = (rule, request) => rule.category === request.category &&
    rule.difficulty === request.difficulty && rule.risk === request.risk;

  return function selectPreference(data) {
    const report = emptyReport(schemaSha256);
    report.schemaVersion = "2.0.0";
    report.selectorVersion = "2.0.0";
    report.audit.baseSchemaSha256 = baseSchemaSha256;
    report.effortExcluded = [];
    report.alternatives = [];
    for (const name of DOCUMENTS) {
      report.audit[`${name}Sha256`] = data[name] === undefined ? null : hashJson(data[name]);
      if (!validators[name](data[name])) report.issues.push({ code: "schema-invalid", document: name });
    }
    if (validators.request(data.request)) {
      const { projectId, taskId, revision, role, mode } = data.request;
      report.identity = { projectId, taskId, revision, role, mode };
    }
    if (report.issues.length) return finish(report, "invalid", "invalid-structure-or-version-mix");

    const { request, catalog, policy } = data;
    report.audit.catalog = { id: catalog.catalogId, revision: catalog.revision };
    report.audit.policy = { id: policy.policyId, revision: policy.revision };
    report.constraints = {
      provider: request.provider ?? null, client: request.client ?? null,
      mode: request.mode, authorizationContext: request.authorizationContext ?? null,
      history: request.history ?? null, maxCorrectionRounds: policy.maxCorrectionRounds,
      maxFutureExecutions: policy.maxFutureExecutions,
      maxFutureDurationSeconds: policy.maxFutureDurationSeconds,
      accessType: policy.accessType, execution: policy.execution
    };
    const profiles = new Map(catalog.profiles.map((entry) => [entry.profileId, entry]));
    // Reuse v1 invariants only; this projection never selects or migrates data.
    const invariantPolicy = {
      ...policy,
      routes: policy.routes.map((route) => ({
        ...route,
        priorities: [...new Set(route.families.flatMap((family) => family.profileIds))]
          .map((profileId) => ({ profileId, rank: 0 }))
      }))
    };
    const issues = semanticIssues(request, catalog, invariantPolicy, profiles);
    const add = (code, document) => issues.push({ code, document });
    const versions = new Set();
    const models = new Set();
    for (const profile of catalog.profiles) {
      const modelKey = JSON.stringify([profile.provider, profile.client, profile.requestedModel]);
      if (models.has(modelKey)) add("duplicate-model-identity", "catalog");
      models.add(modelKey);
      if (profile.versionOrdinal !== null) {
        const key = JSON.stringify([profile.provider, profile.client, profile.familyId, profile.versionOrdinal]);
        if (versions.has(key)) add("duplicate-version-ordinal", "catalog");
        versions.add(key);
      }
      for (const evaluation of profile.evaluations) {
        if (!supportsEffort(profile, evaluation.effort)) add("unsupported-evaluation-effort", "catalog");
      }
    }
    for (const route of policy.routes) {
      if (hasDuplicates(route.families.map((family) => family.familyId))) add("duplicate-family", "policy");
      if (hasDuplicates(route.families.map((family) => family.rank))) add("ambiguous-family-order", "policy");
      if (hasDuplicates(route.families.flatMap((family) => family.profileIds))) add("duplicate-family-profile", "policy");
      const ruleIds = [];
      const combinations = new Map();
      const effortRanks = new Map();
      for (const family of route.families) {
        if (hasDuplicates(family.effortRules.map(scopeKey))) add("overlapping-effort-rules", "policy");
        for (const id of family.profileIds) {
          const profile = profiles.get(id);
          if (profile && profile.familyId !== family.familyId) add("family-profile-mismatch", "policy");
        }
        for (const rule of family.effortRules) {
          ruleIds.push(rule.ruleId);
          if (!route.categories.includes(rule.category)) add("rule-category-not-permitted", "policy");
          if (hasDuplicates(rule.options.map((option) => comboKey(option.profileId, option.effort)))) {
            add("duplicate-effort-option", "policy");
          }
          for (const option of rule.options) {
            const profile = profiles.get(option.profileId);
            if (!profile) { add("unknown-effort-profile", "policy"); continue; }
            if (!family.profileIds.includes(option.profileId)) add("effort-profile-outside-family", "policy");
            if (!supportsEffort(profile, option.effort)) add("unsupported-effort", "policy");
            const key = comboKey(option.profileId, option.effort);
            const previous = combinations.get(key);
            if (previous && (previous.effortRank !== option.effortRank ||
                previous.progressionRank !== option.progressionRank)) add("inconsistent-effort-order", "policy");
            combinations.set(key, option);
            const rankKey = JSON.stringify([option.profileId, option.effortRank]);
            if (effortRanks.has(rankKey) && effortRanks.get(rankKey) !== key) add("ambiguous-effort-order", "policy");
            effortRanks.set(rankKey, key);
          }
        }
      }
      if (hasDuplicates(ruleIds)) add("duplicate-effort-rule-id", "policy");
      for (const profileId of new Set([...combinations.values()].map((option) => option.profileId))) {
        const ordered = [...combinations.values()].filter((option) => option.profileId === profileId)
          .sort((a, b) => a.effortRank - b.effortRank);
        if (ordered.some((option, index) => index > 0 && option.progressionRank < ordered[index - 1].progressionRank)) {
          add("contradictory-quality-progression", "policy");
        }
      }
    }
    if (request.explicitEffort !== undefined && !request.explicitProfileId) add("explicit-effort-without-profile", "request");
    if (request.history?.previousEffort !== undefined && !request.history.previousProfileId) {
      add("previous-effort-without-profile", "request");
    }
    report.issues = uniqueIssues(issues);
    if (report.issues.length) return finish(report, "invalid", "invalid-references-or-data");

    report.missing = REQUIRED_REQUEST_FIELDS.filter((key) => request[key] === undefined);
    if (request.requirements) report.missing.push(...REQUIRED_REQUIREMENTS
      .filter((key) => request.requirements[key] === undefined).map((key) => `requirements.${key}`));
    if (request.escalation && request.history) {
      if (!request.history.previousProfileId) report.missing.push("history.previousProfileId");
      if (request.history.previousEffort === undefined) report.missing.push("history.previousEffort");
    }
    report.missing.sort(compareText);
    if (report.missing.length) return finish(report, "needs-info", "missing-task-information");
    const blocks = taskBlocks(request, policy);
    if (blocks.length) {
      report.reasons.push(...blocks);
      return finish(report, "blocked");
    }
    const route = policy.routes.find((entry) => entry.role === request.role &&
      entry.provider === request.provider && entry.client === request.client);
    if (!route || !route.modes.includes(request.mode) || !route.categories.includes(request.category)) {
      return finish(report, "blocked", "route-not-permitted");
    }
    let previousCombination;
    if (request.escalation) {
      previousCombination = route.families.flatMap((family) => family.effortRules)
        .flatMap((rule) => rule.options).find((option) =>
          option.profileId === request.history.previousProfileId && option.effort === request.history.previousEffort);
      if (!previousCombination) return finish(report, "blocked", "previous-combination-not-in-route");
    }

    const availability = new Map(request.availability.map((entry) => [entry.profileId, entry]));
    const families = new Map(route.families.map((family) => [family.familyId, family]));
    const candidates = [];
    for (const profile of [...catalog.profiles].sort((a, b) => compareText(a.profileId, b.profileId))) {
      const family = families.get(profile.familyId);
      const permitted = family?.profileIds.includes(profile.profileId);
      const record = availability.get(profile.profileId);
      const reasons = profileExclusions(profile, permitted ? { rank: family.rank } : undefined, record, request, policy);
      if (!permitted) {
        report.excluded.push({ profileId: profile.profileId, reasons });
        continue;
      }
      if (family.profileIds.some((id) => profiles.get(id).versionOrdinal === null)) reasons.push("family-version-order-unknown");
      const rule = family.effortRules.find((entry) => sameScope(entry, request));
      if (!rule) reasons.push("no-matching-effort-rule");
      if (reasons.length) {
        report.excluded.push({ profileId: profile.profileId, reasons });
        continue;
      }
      let admitted = 0;
      for (const option of rule.options.filter((entry) => entry.profileId === profile.profileId)
        .sort((a, b) => a.effortRank - b.effortRank)) {
        const optionReasons = [];
        const evaluations = matchingEvaluations(profile, request).filter((entry) => entry.effort === option.effort);
        if (!evaluations.length) optionReasons.push("effort-scope-not-evaluated");
        if (option.effortRank > rule.maxEffortRank) optionReasons.push("effort-limit-exceeded");
        if (previousCombination && option.progressionRank <= previousCombination.progressionRank) {
          optionReasons.push("not-higher-approved-progression");
        }
        if (optionReasons.length) report.effortExcluded.push({ profileId: profile.profileId, effort: option.effort, reasons: optionReasons });
        else {
          candidates.push({ profile, family, rule, option, record, evaluations });
          admitted++;
        }
      }
      if (!admitted) report.excluded.push({ profileId: profile.profileId, reasons: ["no-admissible-effort"] });
    }
    candidates.sort((a, b) => a.family.rank - b.family.rank ||
      b.profile.versionOrdinal - a.profile.versionOrdinal || a.option.effortRank - b.option.effortRank ||
      compareText(a.profile.profileId, b.profile.profileId));
    report.alternatives = candidates.map(({ profile, family, option }) => ({
      profileId: profile.profileId, familyId: family.familyId, familyRank: family.rank,
      versionOrdinal: profile.versionOrdinal, effort: option.effort,
      effortRank: option.effortRank, progressionRank: option.progressionRank
    }));
    const chosen = request.explicitProfileId ? candidates.find((entry) =>
      entry.profile.profileId === request.explicitProfileId &&
      (request.explicitEffort === undefined || entry.option.effort === request.explicitEffort)) : candidates[0];
    if (!chosen) return finish(report, "blocked", request.explicitProfileId
      ? "explicit-choice-not-admissible" : "no-admissible-combination");
    const { profile, family, rule, option, record, evaluations } = chosen;
    report.recommendation = {
      profileId: profile.profileId, provider: profile.provider, client: profile.client,
      requestedModel: profile.requestedModel, versionPolicy: profile.versionPolicy,
      familyId: family.familyId, familyRank: family.rank,
      familyEvidenceRefs: family.evidenceRefs,
      versionOrdinal: profile.versionOrdinal, versionEvidenceRefs: profile.versionEvidenceRefs,
      effort: option.effort, effortRank: option.effortRank, effortRuleId: rule.ruleId,
      effortEvidenceRefs: [...new Set([...rule.evidenceRefs, ...option.evidenceRefs])].sort(compareText),
      progressionRank: option.progressionRank,
      evaluationEvidenceRefs: [...new Set(evaluations.flatMap((entry) => entry.evidenceRefs))].sort(compareText),
      availabilityEvidence: record
    };
    const knownOrdinals = family.profileIds.map((id) => profiles.get(id).versionOrdinal);
    if (profile.versionOrdinal < Math.max(...knownOrdinals)) report.reasons.push("older-than-known-version");
    if (request.escalation) report.reasons.push("quality-escalation-with-declared-evidence");
    return finish(report, "recommended", request.explicitProfileId
      ? "explicit-compatible-choice" : "preferred-family-latest-admissible-version-and-effort");
  };
}

function supportsEffort(profile, effort) {
  return effort === null ? profile.effortOptions.length === 0 : profile.effortOptions.includes(effort);
}
