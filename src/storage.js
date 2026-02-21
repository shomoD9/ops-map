/*
This file is the persistence boundary for Return.
It exists separately so the rest of the app can think in plain state objects while this module hides
whether data comes from `chrome.storage.sync` or a localStorage fallback during non-extension development.
It talks outward to browser storage APIs and inward to `src/main.js`, which calls these functions whenever state loads or changes.
This module only handles shared map state; per-device launch preferences live in `src/devicePrefs.js`.
*/

const STORAGE_KEY = "opsMapStateV1";

function hasChromeSyncStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.sync);
}

function getRuntimeErrorMessage() {
  return chrome?.runtime?.lastError?.message ?? "Unknown storage error";
}

export async function loadState() {
  // We prefer sync storage because the product requirement is Chrome account sync across instances.
  if (hasChromeSyncStorage()) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([STORAGE_KEY], (result) => {
        if (chrome.runtime?.lastError) {
          console.warn("Return: failed to read sync storage.", getRuntimeErrorMessage());
          resolve(null);
          return;
        }

        resolve(result?.[STORAGE_KEY] ?? null);
      });
    });
  }

  // The fallback keeps local iteration possible when the file is opened outside extension runtime.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Return: failed to read local fallback storage.", error);
    return null;
  }
}

export async function saveState(state) {
  if (hasChromeSyncStorage()) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: state }, () => {
        if (chrome.runtime?.lastError) {
          reject(new Error(getRuntimeErrorMessage()));
          return;
        }

        resolve();
      });
    });
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Return: failed to save local fallback storage.", error);
  }
}

export function subscribeToStateChanges(onChange) {
  if (hasChromeSyncStorage()) {
    const listener = (changes, areaName) => {
      if (areaName !== "sync" || !changes?.[STORAGE_KEY]) {
        return;
      }

      onChange(changes[STORAGE_KEY].newValue ?? null);
    };

    chrome.storage.onChanged.addListener(listener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  const listener = (event) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    try {
      onChange(event.newValue ? JSON.parse(event.newValue) : null);
    } catch (error) {
      console.warn("Return: failed to parse storage event payload.", error);
    }
  };

  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener("storage", listener);
  };
}
