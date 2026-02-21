/*
This file stores local per-device preferences.
It is separate from synced map state because browser-launch preferences differ by machine and should not sync.
`src/main.js` reads and writes this module to control how web links open on the current device.
*/

const DEVICE_PREFS_KEY = "opsMapDevicePrefsV1";

export const DEFAULT_DEVICE_PREFS = {};

function hasChromeLocalStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

function getRuntimeErrorMessage() {
  return chrome?.runtime?.lastError?.message ?? "Unknown storage error";
}

function normalizeDevicePrefs(rawPrefs) {
  if (!rawPrefs || typeof rawPrefs !== "object") {
    return { ...DEFAULT_DEVICE_PREFS };
  }

  return { ...DEFAULT_DEVICE_PREFS, ...rawPrefs };
}

export async function loadDevicePrefs() {
  // Device preferences intentionally use local storage area so machine-specific routing does not propagate.
  if (hasChromeLocalStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([DEVICE_PREFS_KEY], (result) => {
        if (chrome.runtime?.lastError) {
          console.warn("Return: failed to read local device preferences.", getRuntimeErrorMessage());
          resolve({ ...DEFAULT_DEVICE_PREFS });
          return;
        }

        resolve(normalizeDevicePrefs(result?.[DEVICE_PREFS_KEY]));
      });
    });
  }

  try {
    const raw = localStorage.getItem(DEVICE_PREFS_KEY);
    return normalizeDevicePrefs(raw ? JSON.parse(raw) : null);
  } catch (error) {
    console.warn("Return: failed to read local preference fallback storage.", error);
    return { ...DEFAULT_DEVICE_PREFS };
  }
}

export async function saveDevicePrefs(nextPrefs) {
  const normalized = normalizeDevicePrefs(nextPrefs);

  if (hasChromeLocalStorage()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [DEVICE_PREFS_KEY]: normalized }, () => {
        if (chrome.runtime?.lastError) {
          reject(new Error(getRuntimeErrorMessage()));
          return;
        }

        resolve();
      });
    });
  }

  try {
    localStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn("Return: failed to save local preference fallback storage.", error);
  }
}

export function subscribeToDevicePrefsChanges(onChange) {
  if (hasChromeLocalStorage()) {
    const listener = (changes, areaName) => {
      if (areaName !== "local" || !changes?.[DEVICE_PREFS_KEY]) {
        return;
      }

      // This keeps multiple extension tabs on the same machine aligned as prefs change.
      onChange(normalizeDevicePrefs(changes[DEVICE_PREFS_KEY].newValue));
    };

    chrome.storage.onChanged.addListener(listener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  const listener = (event) => {
    if (event.key !== DEVICE_PREFS_KEY) {
      return;
    }

    try {
      onChange(normalizeDevicePrefs(event.newValue ? JSON.parse(event.newValue) : null));
    } catch (error) {
      console.warn("Return: failed to parse local preference storage event payload.", error);
    }
  };

  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener("storage", listener);
  };
}
