import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../schemas/skill-catalog.schema.json' with { type: 'json' };

const DEFAULT_CATALOG_URL = new URL('../catalogs/skills.json', import.meta.url);

let compiledValidator = null;
function getValidator() {
  if (!compiledValidator) {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    compiledValidator = ajv.compile(schema);
  }
  return compiledValidator;
}

export class SkillCatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SkillCatalogError';
    this.code = 'SKILL_CATALOG_INVALID';
  }
}

function isSafeRelativeSubpath(relPath) {
  if (typeof relPath !== 'string' || !relPath || relPath.startsWith('/') || relPath.includes('\\') || relPath.includes('\0')) {
    return false;
  }
  const normalized = path.posix.normalize(relPath);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized !== relPath) {
    return false;
  }
  return relPath.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function validateSkillCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SkillCatalogError('El catálogo de skills debe ser un objeto JSON válido.');
  }
  const copy = structuredClone(value);
  const validate = getValidator();
  if (!validate(copy)) {
    throw new SkillCatalogError('El catálogo de skills no cumple el esquema requerido.');
  }

  const seenSkills = new Set();
  for (const skill of copy.skills) {
    if (seenSkills.has(skill.name)) {
      throw new SkillCatalogError(`Skill duplicada en el catálogo: ${skill.name}.`);
    }
    seenSkills.add(skill.name);

    if (skill.installedPath !== `skills/${skill.name}` && skill.installedPath !== `catalogs/skills/${skill.name}`) {
      throw new SkillCatalogError(`Ruta instalada incoherente para ${skill.name}.`);
    }
    if (!isSafeRelativeSubpath(skill.sourcePath)) {
      throw new SkillCatalogError(`Ruta origen inválida para ${skill.name}.`);
    }

    const seenFiles = new Set();
    let hasSkillMd = false;
    for (const file of skill.files) {
      if (!isSafeRelativeSubpath(file.path)) {
        throw new SkillCatalogError(`Ruta de archivo fuera de alcance en ${skill.name}: ${file.path}.`);
      }
      if (seenFiles.has(file.path)) {
        throw new SkillCatalogError(`Archivo repetido en el manifiesto de ${skill.name}: ${file.path}.`);
      }
      seenFiles.add(file.path);
      if (file.path === 'SKILL.md') hasSkillMd = true;
    }
    if (!hasSkillMd) {
      throw new SkillCatalogError(`Falta SKILL.md en el manifiesto de ${skill.name}.`);
    }

    for (const scenario of skill.scenarios) {
      if (scenario.revision !== skill.revision) {
        throw new SkillCatalogError(`El escenario ${scenario.id} de ${skill.name} apunta a otra revisión.`);
      }
      if (!skill.matching.profiles.includes(scenario.profile)) {
        throw new SkillCatalogError(`El escenario ${scenario.id} de ${skill.name} usa un perfil no cubierto.`);
      }
      if (!skill.matching.taskClasses.includes(scenario.taskClass)) {
        throw new SkillCatalogError(`El escenario ${scenario.id} de ${skill.name} usa una clase de tarea no cubierta.`);
      }
      if (!isSafeRelativeSubpath(scenario.evidencePath)) {
        throw new SkillCatalogError(`Ruta de evidencia inválida en el escenario ${scenario.id}.`);
      }
    }
  }

  const seenRefs = new Set();
  for (const ref of copy.externalReferences) {
    if (seenSkills.has(ref.name) || seenRefs.has(ref.name)) {
      throw new SkillCatalogError(`Referencia externa duplicada: ${ref.name}.`);
    }
    seenRefs.add(ref.name);
  }

  const seenAddons = new Set();
  for (const addon of copy.addons) {
    if (seenAddons.has(addon.id)) {
      throw new SkillCatalogError(`Añadido duplicado en el catálogo: ${addon.id}.`);
    }
    seenAddons.add(addon.id);
  }

  return deepFreeze(copy);
}

export async function loadSkillCatalog({ catalogUrl = DEFAULT_CATALOG_URL } = {}) {
  let raw;
  try {
    raw = await fs.readFile(catalogUrl, 'utf8');
  } catch {
    throw new SkillCatalogError('No se pudo leer el catálogo confiable de skills.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SkillCatalogError('El catálogo de skills no contiene JSON válido.');
  }
  return validateSkillCatalog(parsed);
}
