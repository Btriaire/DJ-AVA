// lib/atelier/bank.ts
// WAV storage is separate from metadata to avoid accidental cleanup of the bank
export interface BankItem {
  id: string;
  name: string;
  kind: "sample" | "stem";
  stem?: string;
  from: string;
  bpm: number;
  key: string;
  dur: number;
  tags: string;
  addedAt: number;
}

const STORAGE_KEY = "djsynth.bank.v1";
const DB_NAME = "djsynth-bank";
const DB_VERSION = 1;
const STORE_NAME = "wav";

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const req = run(store);

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);

      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
      transaction.onabort = () => db.close();
    };

    request.onerror = () => reject(request.error);
  });
}

export function listBank(): BankItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addToBank(
  wav: Blob,
  meta: Omit<BankItem, "id" | "addedAt">
): Promise<BankItem> {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const item: BankItem = { ...meta, id, addedAt: Date.now() };

  try {
    await withStore("readwrite", (store) => store.add(wav, id));
    const bank = [item, ...listBank()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
    return item;
  } catch {
    await withStore("readwrite", (store) => store.delete(id)).catch(() => {});
    throw new Error("Stockage du navigateur plein");
  }
}

export async function getBankWav(id: string): Promise<Blob | null> {
  try {
    return await withStore("readonly", (store) => store.get(id));
  } catch {
    return null;
  }
}

export async function removeFromBank(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
  const bank = listBank().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
}

export function updateBankItem(
  id: string,
  patch: Partial<Pick<BankItem, "name" | "tags">>
): void {
  const bank = listBank().map((item) =>
    item.id === id ? { ...item, ...patch } : item
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
}
