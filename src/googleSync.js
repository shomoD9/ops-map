/*
This file is a scaffold for future Google-backed cloud sync beyond browser-native sync.
It exists separately so future OAuth and remote sync flows can be added behind a stable interface without rewriting UI wiring.
`src/main.js` consumes this module today for explicit user-facing status messaging and capability checks.
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
