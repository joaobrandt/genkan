// The generated sky, kept in IndexedDB so the TV makes it only once per installation
// (sky.ts). Best effort: if storage fails, the sky is simply made again at the next launch.
const DB = 'genkan';
const STORE = 'sky';

export interface KeptSky {
  seed: number;
  milkyWay: Blob; // PNG
  stars: Blob; // PNG
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadSky(key: string): Promise<KeptSky | null> {
  try {
    const db = await open();
    const sky = await new Promise<KeptSky | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return sky ?? null;
  } catch {
    return null;
  }
}

/** Keep `sky` as the one sky, dropping any older one. */
export async function saveSky(key: string, sky: KeptSky) {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.objectStore(STORE).put(sky, key);
    tx.oncomplete = () => db.close();
  } catch {
    // not kept: the next launch makes a new one
  }
}
