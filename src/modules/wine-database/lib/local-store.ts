"use client";

import { useSyncExternalStore } from "react";

const KEY = "gs-hub:wine-library:v1";
const EVENT = "gs-hub:wine-library-changed";
const READ_ERROR = "__storage_unavailable__";

function subscribe(callback: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) callback();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(EVENT, callback);
  };
}

export function useLocalWineChanges() {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(KEY);
      } catch {
        return READ_ERROR;
      }
    },
    () => null,
  );
}
