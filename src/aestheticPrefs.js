/*
This file stores the selected visual aesthetic for Ops Map.
It exists separately from map entities because aesthetic choice is a UI preference and should not
be mixed into campaign/project domain data or import/export contracts.
`src/main.js` reads and writes this module, then swaps the stylesheet link at runtime so users can
switch between vanilla and bhadralok without changing data flow.
*/

const AESTHETIC_STORAGE_KEY = "opsMapAestheticV1";

export const AESTHETICS = {
  VANILLA: "vanilla",
  BHADRALOK: "bhadralok"
};

export const DEFAULT_AESTHETIC = AESTHETICS.BHADRALOK;

function hasChromeSyncStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.sync);
}

function getRuntimeErrorMessage() {
  return chrome?.runtime?.lastError?.message ?? "Unknown storage error";
}

export function sanitizeAesthetic(value) {
  return value === AESTHETICS.VANILLA ? AESTHETICS.VANILLA : AESTHETICS.BHADRALOK;
}

export async function loadAestheticPref() {
  if (hasChromeSyncStorage()) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([AESTHETIC_STORAGE_KEY], (result) => {
        if (chrome.runtime?.lastError) {
          console.warn("Ops Map: failed to read aesthetic preference.", getRuntimeErrorMessage());
          resolve(DEFAULT_AESTHETIC);
          return;
        }

        resolve(sanitizeAesthetic(result?.[AESTHETIC_STORAGE_KEY]));
      });
    });
  }

  try {
    return sanitizeAesthetic(localStorage.getItem(AESTHETIC_STORAGE_KEY));
  } catch (error) {
    console.warn("Ops Map: failed to read local aesthetic preference fallback.", error);
    return DEFAULT_AESTHETIC;
  }
}

export async function saveAestheticPref(aesthetic) {
  const normalized = sanitizeAesthetic(aesthetic);

  if (hasChromeSyncStorage()) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [AESTHETIC_STORAGE_KEY]: normalized }, () => {
        if (chrome.runtime?.lastError) {
          reject(new Error(getRuntimeErrorMessage()));
          return;
        }

        resolve();
      });
    });
  }

  try {
    localStorage.setItem(AESTHETIC_STORAGE_KEY, normalized);
  } catch (error) {
    console.warn("Ops Map: failed to save local aesthetic preference fallback.", error);
  }
}

export function subscribeToAestheticPrefChanges(onChange) {
  if (hasChromeSyncStorage()) {
    const listener = (changes, areaName) => {
      if (areaName !== "sync" || !changes?.[AESTHETIC_STORAGE_KEY]) {
        return;
      }

      // This keeps multiple extension tabs aligned when aesthetic mood changes in one tab.
      onChange(sanitizeAesthetic(changes[AESTHETIC_STORAGE_KEY].newValue));
    };

    chrome.storage.onChanged.addListener(listener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  const listener = (event) => {
    if (event.key !== AESTHETIC_STORAGE_KEY) {
      return;
    }

    onChange(sanitizeAesthetic(event.newValue));
  };

  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener("storage", listener);
  };
}
