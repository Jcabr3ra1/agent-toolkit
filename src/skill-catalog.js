import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

    const scenarioIds = new Set();
    for (const scenario of skill.scenarios) {
      if (scenarioIds.has(scenario.id)) throw new SkillCatalogError(`Escenario duplicado en ${skill.name}: ${scenario.id}.`);
      scenarioIds.add(scenario.id);
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

// Refuse symbolic parents as well as symbolic files when checking catalog resources.
export async function resolveCatalogResource(toolkitRoot, relativePath) {
  if (!isSafeRelativeSubpath(relativePath)) throw new SkillCatalogError('Ruta de recurso de catálogo inválida.');
  let target = await fs.realpath(toolkitRoot);
  const segments = relativePath.split('/');
  for (let i = 0; i < segments.length; i++) {
    target = path.join(target, segments[i]);
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || (i < segments.length - 1 && !stat.isDirectory())) {
      throw new SkillCatalogError(`Recurso del catálogo con enlace o padre no regular: ${relativePath}.`);
    }
  }
  return target;
}

export async function loadSkillCatalog({ catalogUrl = DEFAULT_CATALOG_URL } = {}) {
  let raw;
  try {
    const stat = await fs.lstat(catalogUrl);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) {
      throw new SkillCatalogError('El catálogo debe ser un archivo regular de hasta 2 MiB, sin enlaces simbólicos.');
    }
    raw = await fs.readFile(catalogUrl, 'utf8');
  } catch (error) {
    if (error instanceof SkillCatalogError) throw error;
    throw new SkillCatalogError('No se pudo leer el catálogo confiable de skills.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SkillCatalogError('El catálogo de skills no contiene JSON válido.');
  }
  const catalog = validateSkillCatalog(parsed);
  const filename = catalogUrl instanceof URL ? fileURLToPath(catalogUrl) : path.resolve(catalogUrl);
  const toolkitRoot = path.dirname(path.dirname(filename));
  for (const skill of catalog.skills) {
    for (const scenario of skill.scenarios.filter(item => item.status === 'passed')) {
      try {
        const evidencePath = await resolveCatalogResource(toolkitRoot, scenario.evidencePath);
        const stat = await fs.lstat(evidencePath);
        if (!stat.isFile() || stat.size === 0 || stat.size > 512 * 1024) throw new Error('Invalid evidence file');
      } catch {
        throw new SkillCatalogError(`Evidencia ausente, vacía o no regular para ${skill.name}/${scenario.id}: ${scenario.evidencePath}.`);
      }
    }
  }
  return catalog;
}
