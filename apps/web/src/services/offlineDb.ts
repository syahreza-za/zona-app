import Dexie, { type Table } from 'dexie';

interface WorkspaceEntry {
  key: string;
  payload: unknown;
  updatedAt: number;
}

class ZonaOfflineDatabase extends Dexie {
  workspace!: Table<WorkspaceEntry, string>;

  constructor() {
    super('zona_offline_dexie_v2');
    this.version(1).stores({
      workspace: 'key, updatedAt',
    });
  }
}

const db = new ZonaOfflineDatabase();
const WORKSPACE_KEY = 'snapshot';

export async function saveWorkspaceSnapshot(payload: unknown): Promise<void> {
  try {
    await db.workspace.put({
      key: WORKSPACE_KEY,
      payload,
      updatedAt: Date.now(),
    });
  } catch {
    try {
      localStorage.setItem('zona_offline_fallback_v2', JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors in restricted contexts
    }
  }
}

export async function loadWorkspaceSnapshot<T>(): Promise<T | null> {
  try {
    const entry = await db.workspace.get(WORKSPACE_KEY);
    if (entry?.payload) {
      return entry.payload as T;
    }
  } catch {
    // Fallback below
  }

  try {
    const raw = localStorage.getItem('zona_offline_fallback_v2');
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function clearWorkspaceSnapshot(): Promise<void> {
  try {
    await db.workspace.delete(WORKSPACE_KEY);
  } catch {
    // Ignore
  }
  try {
    localStorage.removeItem('zona_offline_fallback_v2');
  } catch {
    // Ignore
  }
}
