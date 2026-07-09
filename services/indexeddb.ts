import { DayLog } from '../types';

const DB_NAME = 'nutrivault';
const DB_VERSION = 1;
const LOGS_STORE = 'dayLogs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOGS_STORE)) {
        db.createObjectStore(LOGS_STORE, { keyPath: 'date' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

/** Check if IndexedDB is available and functional */
export async function isIndexedDBAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openDB();
    return !!db;
  } catch {
    return false;
  }
}

/** Migrate existing localStorage logs into IndexedDB (one-time) */
export async function migrateLogsToIDB(logs: Record<string, DayLog>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readwrite');
  const store = tx.objectStore(LOGS_STORE);
  const entries = Object.values(logs);
  for (const entry of entries) {
    store.put(entry);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all day logs as a Record keyed by date */
export async function getAllLogs(): Promise<Record<string, DayLog>> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readonly');
  const store = tx.objectStore(LOGS_STORE);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const result: Record<string, DayLog> = {};
      for (const entry of request.result) {
        result[entry.date] = entry;
      }
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Get a single day's log */
export async function getDayLog(date: string): Promise<DayLog | undefined> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readonly');
  const store = tx.objectStore(LOGS_STORE);
  const request = store.get(date);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Save a single day's log (upsert) */
export async function saveDayLog(dayLog: DayLog): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readwrite');
  const store = tx.objectStore(LOGS_STORE);
  store.put(dayLog);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Save multiple day logs at once (batch upsert) */
export async function saveDayLogs(logs: Record<string, DayLog>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readwrite');
  const store = tx.objectStore(LOGS_STORE);
  for (const dayLog of Object.values(logs)) {
    store.put(dayLog);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get logs for a specific date range (inclusive) */
export async function getLogsInRange(startDate: string, endDate: string): Promise<Record<string, DayLog>> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readonly');
  const store = tx.objectStore(LOGS_STORE);
  const range = IDBKeyRange.bound(startDate, endDate);
  const request = store.getAll(range);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const result: Record<string, DayLog> = {};
      for (const entry of request.result) {
        result[entry.date] = entry;
      }
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Delete a specific day log */
export async function deleteDayLog(date: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readwrite');
  const store = tx.objectStore(LOGS_STORE);
  store.delete(date);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Delete ALL day logs (used by "clear all data") */
export async function clearAllLogs(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readwrite');
  const store = tx.objectStore(LOGS_STORE);
  store.clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get total count of day logs */
export async function getLogCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(LOGS_STORE, 'readonly');
  const store = tx.objectStore(LOGS_STORE);
  const request = store.count();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
