const memoryStorage = new Map();

const hasLocalStorage = () => {
  return typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined";
};

const createDefaultStorage = () => ({
  getItem: async (key) => {
    if (hasLocalStorage()) {
      return globalThis.localStorage.getItem(key);
    }

    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  },
  setItem: async (key, value) => {
    if (hasLocalStorage()) {
      globalThis.localStorage.setItem(key, value);
      return;
    }

    memoryStorage.set(key, value);
  },
  removeItem: async (key) => {
    if (hasLocalStorage()) {
      globalThis.localStorage.removeItem(key);
      return;
    }

    memoryStorage.delete(key);
  },
});

const normalizeStorage = (adapter) => {
  if (!adapter) {
    return createDefaultStorage();
  }

  return {
    getItem: async (key) => {
      if (typeof adapter.getItem === "function") {
        return await adapter.getItem(key);
      }

      return null;
    },
    setItem: async (key, value) => {
      if (typeof adapter.setItem === "function") {
        await adapter.setItem(key, value);
      }
    },
    removeItem: async (key) => {
      if (typeof adapter.removeItem === "function") {
        await adapter.removeItem(key);
        return;
      }

      if (typeof adapter.setItem === "function") {
        await adapter.setItem(key, null);
      }
    },
  };
};

let runtimeStorage = createDefaultStorage();

export const configureStorage = (adapter) => {
  runtimeStorage = normalizeStorage(adapter);
};

export const authStorage = {
  getItem: async (key) => runtimeStorage.getItem(key),
  setItem: async (key, value) => runtimeStorage.setItem(key, value),
  removeItem: async (key) => runtimeStorage.removeItem(key),
};
