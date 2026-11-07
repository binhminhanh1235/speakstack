import { SpeakPack, TierType } from '../../../shared/schema';

const DB_NAME = 'SpeakStackDB';
const DB_VERSION = 1;
const STORE_PACKS = 'packs';
const STORE_PROGRESS = 'progress';
const STORE_RECORDINGS = 'recordings';

export type PracticeMode = 'listen' | 'shadow' | 'type' | 'recall' | 'free';

export interface PracticeAttempt {
  id: string;
  packId: string;
  mode: PracticeMode;
  tier: TierType;
  timestamp: string;
  wpm: number;
  longPauses: number;
  matchRate: number;
}

export interface PackMastery {
  packId: string;
  level: 0 | 1 | 2 | 3 | 4; // 0: unseen, 1: listened/shadowed, 2: typed, 3: recalled, 4: free mastered
  intervalDays: number;
  nextReview: string;
  lastPracticedAt: string;
}

export interface WeakWordEntry {
  word: string;
  missCount: number;
  lastMissedAt: string;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  fontSize: 'normal' | 'large';
  targetWpm: number;
  ttsEnabled: boolean;
  ttsRate: 0.75 | 1 | 1.25;
  voiceURI: string;
  defaultTier: TierType;
  musicEnabled: boolean;
  musicVolume: number;
  musicTrackId: string;
  enableVirtualKeyboard: boolean;
  lastFilterTemplate: string;
  lastFilterTopic: string;
  lastPackId: string;
}

export interface UserProgressData {
  attempts: PracticeAttempt[];
  mastery: Record<string, PackMastery>;
  weakWords: Record<string, WeakWordEntry>;
  settings: UserSettings;
  updatedAt: string;
}

export interface RecordingRecord {
  id: string;
  packId: string;
  segmentId: string;
  mode: string;
  createdAt: string;
  mimeType: string;
  blob: Blob;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  fontSize: 'normal',
  targetWpm: 120,
  ttsEnabled: true,
  ttsRate: 1,
  voiceURI: '',
  defaultTier: 2,
  musicEnabled: false,
  musicVolume: 0.18,
  musicTrackId: 'focus-ambient',
  enableVirtualKeyboard: false,
  lastFilterTemplate: 'all',
  lastFilterTopic: 'all',
  lastPackId: 'idempotency-concept'
};

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memPacks = new Map<string, SpeakPack>();
let memProgress: UserProgressData = {
  attempts: [],
  mastery: {},
  weakWords: {},
  settings: { ...DEFAULT_SETTINGS },
  updatedAt: new Date().toISOString()
};
const memRecordings: RecordingRecord[] = [];

export function openSpeakDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e: any) => {
        const db: IDBDatabase = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PACKS)) {
          db.createObjectStore(STORE_PACKS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
          db.createObjectStore(STORE_PROGRESS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
          db.createObjectStore(STORE_RECORDINGS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function idbGetAllPacks(): Promise<SpeakPack[]> {
  const db = await openSpeakDB();
  if (!db) return Array.from(memPacks.values());

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PACKS, 'readonly');
      const req = tx.objectStore(STORE_PACKS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve(Array.from(memPacks.values()));
    } catch {
      resolve(Array.from(memPacks.values()));
    }
  });
}

export async function idbSavePacks(packs: SpeakPack[]): Promise<boolean> {
  for (const p of packs) {
    if (p && p.id) memPacks.set(p.id, p);
  }
  const db = await openSpeakDB();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PACKS, 'readwrite');
      const store = tx.objectStore(STORE_PACKS);
      for (const p of packs) {
        if (p && p.id) store.put(p);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(true);
    } catch {
      resolve(true);
    }
  });
}

export async function idbDeletePack(id: string): Promise<boolean> {
  memPacks.delete(id);
  const db = await openSpeakDB();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PACKS, 'readwrite');
      tx.objectStore(STORE_PACKS).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(true);
    } catch {
      resolve(true);
    }
  });
}

export async function idbLoadProgress(): Promise<UserProgressData> {
  const db = await openSpeakDB();
  if (!db) return memProgress;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PROGRESS, 'readonly');
      const req = tx.objectStore(STORE_PROGRESS).get('main');
      req.onsuccess = () => {
        if (req.result && req.result.data) {
          const loaded = req.result.data as UserProgressData;
          memProgress = {
            attempts: loaded.attempts || [],
            mastery: loaded.mastery || {},
            weakWords: loaded.weakWords || {},
            settings: { ...DEFAULT_SETTINGS, ...(loaded.settings || {}) },
            updatedAt: loaded.updatedAt || new Date().toISOString()
          };
        }
        resolve(memProgress);
      };
      req.onerror = () => resolve(memProgress);
    } catch {
      resolve(memProgress);
    }
  });
}

export async function idbSaveProgress(progress: UserProgressData): Promise<boolean> {
  memProgress = {
    ...progress,
    updatedAt: new Date().toISOString()
  };
  const db = await openSpeakDB();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_PROGRESS, 'readwrite');
      tx.objectStore(STORE_PROGRESS).put({ key: 'main', data: memProgress });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(true);
    } catch {
      resolve(true);
    }
  });
}

const MAX_RECORDINGS = 20;

export async function idbSaveRecording(rec: RecordingRecord): Promise<boolean> {
  memRecordings.unshift(rec);
  if (memRecordings.length > MAX_RECORDINGS) memRecordings.length = MAX_RECORDINGS;

  const db = await openSpeakDB();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_RECORDINGS, 'readwrite');
      const store = tx.objectStore(STORE_RECORDINGS);
      store.put(rec);

      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const all: RecordingRecord[] = getAllReq.result || [];
        if (all.length > MAX_RECORDINGS) {
          all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          for (const old of all.slice(MAX_RECORDINGS)) {
            store.delete(old.id);
          }
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(true);
    } catch {
      resolve(true);
    }
  });
}

export async function idbGetRecordingsForPack(packId: string): Promise<RecordingRecord[]> {
  const db = await openSpeakDB();
  if (!db) return memRecordings.filter((r) => r.packId === packId);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_RECORDINGS, 'readonly');
      const req = tx.objectStore(STORE_RECORDINGS).getAll();
      req.onsuccess = () => {
        const all: RecordingRecord[] = req.result || [];
        const filtered = all
          .filter((r) => r.packId === packId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(filtered);
      };
      req.onerror = () => resolve(memRecordings.filter((r) => r.packId === packId));
    } catch {
      resolve(memRecordings.filter((r) => r.packId === packId));
    }
  });
}
