// Tiny IndexedDB key/value store. Values are stored as strings (JSON).
// Used by userStorage.ts to offload large payloads (leads, movements, sessions,
// meetings) that would otherwise blow the ~5MB localStorage quota.

const DB_NAME = "p21";
const STORE = "kv";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
const IDB_OPEN_TIMEOUT = 5000;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error("IndexedDB open timeout"));
    }, IDB_OPEN_TIMEOUT);

    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      
      req.onsuccess = () => {
        clearTimeout(timeout);
        resolve(req.result);
      };
      
      req.onerror = () => {
        clearTimeout(timeout);
        reject(req.error);
      };
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
  
  return dbPromise;
}

export async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[idbCache] get failed", key, e);
    return null;
  }
}

export async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[idbCache] set failed", key, e);
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[idbCache] delete failed", key, e);
  }
}
