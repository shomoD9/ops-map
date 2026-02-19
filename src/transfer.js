/*
This file defines export/import transfer contracts for Ops Map state.
It exists separately so serialization, validation, and filename rules stay pure and reusable instead of being buried in UI handlers.
`src/main.js` uses these functions to build downloadable snapshots and safely parse uploaded files before replacing in-memory state.
*/

export const EXPORT_FORMAT = "ops-map-export";
export const EXPORT_VERSION = 1;

function isIsoDateString(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function countStateEntities(state) {
  const campaigns = Array.isArray(state?.campaigns) ? state.campaigns.length : 0;
  const projects = Array.isArray(state?.projects) ? state.projects.length : 0;

  return {
    campaigns,
    projects
  };
}

function hasValidStateShape(state) {
  if (!ensureObject(state)) {
    return false;
  }

  // We validate top-level collection shape here and leave deep normalization to the model layer.
  return Array.isArray(state.campaigns) && Array.isArray(state.projects);
}

export function buildExportPayload(state) {
  // The envelope is versioned so future schema changes can remain backward-compatible.
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    state
  };
}

export function serializeExportPayload(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function suggestExportFileName(timestamp = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${timestamp.getFullYear()}-${pad(timestamp.getMonth() + 1)}-${pad(timestamp.getDate())}`;
  const timePart = `${pad(timestamp.getHours())}-${pad(timestamp.getMinutes())}-${pad(timestamp.getSeconds())}`;

  return `ops-map-export-${datePart}_${timePart}.json`;
}

export function parseImportPayload(rawText) {
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error("This file is not valid JSON.");
  }

  if (!ensureObject(parsed)) {
    throw new Error("Import file must be a JSON object.");
  }

  if (parsed.format !== EXPORT_FORMAT) {
    throw new Error(`Unsupported import format. Expected \"${EXPORT_FORMAT}\".`);
  }

  if (parsed.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported export version \"${parsed.version}\".`);
  }

  if (!isIsoDateString(parsed.exportedAt)) {
    throw new Error("Import file is missing a valid exported timestamp.");
  }

  if (!hasValidStateShape(parsed.state)) {
    throw new Error("Import file state payload is malformed.");
  }

  return {
    payload: parsed,
    summary: countStateEntities(parsed.state)
  };
}
