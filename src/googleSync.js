/*
This file is a scaffold for future Google-backed cloud sync beyond browser-native sync.
It exists separately so future OAuth and remote sync flows can be added behind a stable interface without rewriting UI wiring.
`src/main.js` consumes this module today for explicit user-facing status messaging, capability checks,
and lightweight sync diagnostics that help users verify cross-device prerequisites.
*/

const GOOGLE_SYNC_STATUS = {
  state: "coming_soon",
  reason:
    "Cross-browser automatic sync via Google account is not implemented yet. Use Export Data and Import Data for now."
};

export function isGoogleSyncAvailable() {
  // This stays false until OAuth + cloud storage sync is fully implemented.
  return false;
}

export function getGoogleSyncStatus() {
  return {
    ...GOOGLE_SYNC_STATUS
  };
}

function hasChromeSyncStorage() {
  // Diagnostics mirror the real persistence capability check used by storage adapters.
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.sync);
}

function getExtensionId() {
  if (typeof chrome === "undefined") {
    return "Unavailable outside extension runtime";
  }

  return chrome.runtime?.id || "Unknown extension ID";
}

export function getGoogleSyncDiagnostics() {
  const status = getGoogleSyncStatus();

  // We keep diagnostics intentionally plain so the panel can explain sync prerequisites in one glance.
  return {
    extensionId: getExtensionId(),
    storageBackend: hasChromeSyncStorage() ? "chrome.storage.sync" : "localStorage fallback",
    crossBrowserCloudSync: status.state
  };
}
