// db.js — a tiny wrapper around IndexedDB, the browser's built-in database.
// Everything is saved on the phone. Nothing is sent to a server.
//
// Stores (think of them as tables):
//   kv       key -> value pairs (targets, profile, settings, custom groups)
//   foods    your saved foods, keyed by id
//   entries  what you ate, keyed by id, with an index on `date` for fast "what did I eat on X" lookups

const NAME = 'meal-tracker';
const VERSION = 1; // bump this (and add to onupgradeneeded) if the structure ever changes

let dbPromise;

export function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('foods')) db.createObjectStore('foods', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('entries')) {
          const entries = db.createObjectStore('entries', { keyPath: 'id' });
          entries.createIndex('date', 'date');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// Runs one request inside a transaction and resolves with its result once the transaction completes.
function run(store, mode, makeRequest) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = makeRequest(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, value, key) => run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
export const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
export const all = (store) => run(store, 'readonly', (s) => s.getAll());
export const byIndex = (store, index, range) => run(store, 'readonly', (s) => s.index(index).getAll(range));
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());

// Every [key, value] pair in a store (used for backups of the kv store).
export function pairs(store) {
  return open().then((db) => new Promise((resolve, reject) => {
    const out = [];
    const tx = db.transaction(store, 'readonly');
    const cursorReq = tx.objectStore(store).openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) { out.push([cursor.key, cursor.value]); cursor.continue(); }
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  }));
}
