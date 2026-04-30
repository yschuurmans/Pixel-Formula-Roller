import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DieType, EvaluationResult, ParsedFormula } from '../types/formula';

export const STORAGE_WARNING_EVENT = 'pixel-formula-roller:storage-warning';
export const STORAGE_WARNING_MESSAGE = 'Storage full — oldest history entries will be removed';
export const ROLL_HISTORY_PREVIEW_LIMIT = 5;
export const ROLL_HISTORY_STORAGE_LIMIT = 50;

type PersistedAppState = Pick<AppState, 'savedFormulas' | 'rollHistory' | 'settings' | 'pairedPixelIds' | 'pairedPixels'>;

export interface SavedFormula {
  id: string;
  name: string;
  formula: string;
  createdAt: number;
  updatedAt: number;
}

export interface RollHistoryEntry {
  id: string;
  formulaName: string;
  formulaString: string;
  total: number;
  rolledAt: number;
  result: EvaluationResult;
  parsedFormula: ParsedFormula;
}

export interface AppSettings {
  theme: 'dark';
  highlightLowBattery: boolean;
}

export interface PixelEntry {
  pixelId: string;
  dieType: DieType;
  connectionState: 'connected' | 'disconnected';
  batteryLevel: number | null;
  lastFace: number | null;
  isRolling?: boolean;
}

export interface RememberedPixelEntry {
  pixelId: string;
  dieType: DieType;
  lastUsedAt: number | null;
}

interface AppState {
  savedFormulas: SavedFormula[];
  rollHistory: RollHistoryEntry[];
  settings: AppSettings;
  pairedPixelIds: string[];
  pairedPixels: Record<string, RememberedPixelEntry>;
  pixels: Record<string, PixelEntry>;
  bleAvailable: boolean;
  bleError: string | null;
}

interface AppActions {
  setSavedFormulas: (formulas: SavedFormula[]) => void;
  addSavedFormula: (formula: SavedFormula) => void;
  updateSavedFormula: (id: string, updates: Partial<SavedFormula>) => void;
  deleteSavedFormula: (id: string) => void;
  addRollHistory: (entry: RollHistoryEntry) => void;
  clearRollHistory: () => void;
  rememberPairedPixelId: (pixelId: string) => void;
  rememberPairedPixel: (entry: { pixelId: string; dieType: DieType }) => void;
  markPairedPixelUsed: (pixelId: string, usedAt?: number) => void;
  forgetPairedPixelId: (pixelId: string) => void;
  addPixel: (entry: PixelEntry) => void;
  updatePixelState: (id: string, updates: Partial<PixelEntry>) => void;
  removePixel: (id: string) => void;
  setBleError: (error: string | null) => void;
  clearBleError: () => void;
  setSettings: (settings: AppSettings) => void;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  highlightLowBattery: false,
};

function isQuotaExceededError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

function dispatchStorageWarning(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(STORAGE_WARNING_EVENT, {
      detail: { message: STORAGE_WARNING_MESSAGE },
    }),
  );
}

const appStorage = createJSONStorage<PersistedAppState>(
  () => ({
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch (error) {
        if (!isQuotaExceededError(error)) {
          throw error;
        }

        const persisted = JSON.parse(value) as {
          state?: PersistedAppState;
          version?: number;
        };
        const trimmedHistory = (persisted.state?.rollHistory ?? []).slice(
          0,
          Math.max(1, Math.floor(ROLL_HISTORY_STORAGE_LIMIT / 2)),
        );

        dispatchStorageWarning();

        localStorage.setItem(
          name,
          JSON.stringify({
            ...persisted,
            state: {
              ...persisted.state,
              savedFormulas: persisted.state?.savedFormulas ?? [],
              rollHistory: trimmedHistory,
              settings: persisted.state?.settings ?? defaultSettings,
            },
          }),
        );
      }
    },
    removeItem: (name) => localStorage.removeItem(name),
  }),
);

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set) => ({
      savedFormulas: [],
      rollHistory: [],
      settings: defaultSettings,
      pairedPixelIds: [],
      pairedPixels: {},
      pixels: {},
      bleAvailable: true,
      bleError: null,

      setSavedFormulas: (formulas) => set({ savedFormulas: formulas }),
      addSavedFormula: (formula) =>
        set((state) => ({ savedFormulas: [...state.savedFormulas, formula] })),
      updateSavedFormula: (id, updates) =>
        set((state) => ({
          savedFormulas: state.savedFormulas.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        })),
      deleteSavedFormula: (id) =>
        set((state) => ({
          savedFormulas: state.savedFormulas.filter((f) => f.id !== id),
        })),
      addRollHistory: (entry) =>
        set((state) => ({
          rollHistory: [entry, ...state.rollHistory].slice(0, ROLL_HISTORY_STORAGE_LIMIT),
        })),
      clearRollHistory: () => set({ rollHistory: [] }),
      rememberPairedPixelId: (pixelId) =>
        set((state) => ({
          pairedPixelIds: state.pairedPixelIds.includes(pixelId)
            ? state.pairedPixelIds
            : [...state.pairedPixelIds, pixelId],
        })),
      rememberPairedPixel: (entry) =>
        set((state) => {
          const existing = state.pairedPixels[entry.pixelId]

          return {
            pairedPixelIds: state.pairedPixelIds.includes(entry.pixelId)
              ? state.pairedPixelIds
              : [...state.pairedPixelIds, entry.pixelId],
            pairedPixels: {
              ...state.pairedPixels,
              [entry.pixelId]: {
                pixelId: entry.pixelId,
                dieType: entry.dieType,
                lastUsedAt: existing?.lastUsedAt ?? null,
              },
            },
          }
        }),
      markPairedPixelUsed: (pixelId, usedAt = Date.now()) =>
        set((state) => {
          const existing = state.pairedPixels[pixelId]
          if (!existing) {
            return state
          }

          return {
            pairedPixels: {
              ...state.pairedPixels,
              [pixelId]: {
                ...existing,
                lastUsedAt: usedAt,
              },
            },
          }
        }),
      forgetPairedPixelId: (pixelId) =>
        set((state) => ({
          pairedPixelIds: state.pairedPixelIds.filter((id) => id !== pixelId),
          pairedPixels: Object.fromEntries(
            Object.entries(state.pairedPixels).filter(([id]) => id !== pixelId),
          ),
        })),
      addPixel: (entry) =>
        set((state) => ({
          pixels: {
            ...state.pixels,
            [entry.pixelId]: { ...entry, isRolling: entry.isRolling ?? false },
          },
        })),
      updatePixelState: (id, updates) =>
        set((state) => {
          const current = state.pixels[id]
          if (!current) {
            return state
          }

          return {
            pixels: {
              ...state.pixels,
              [id]: { ...current, ...updates },
            },
          }
        }),
      removePixel: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.pixels;
          return { pixels: rest };
        }),
      setBleError: (error) => set({ bleError: error }),
      clearBleError: () => set({ bleError: null }),
      setSettings: (settings) => set({ settings }),
    }),
    {
      name: 'pixel-formula-roller',
      version: 3,
      storage: appStorage,
      migrate: (persistedState, _version) => {
        const typedState = persistedState as (Partial<PersistedAppState> & {
          settings?: Partial<AppSettings> & { historyLength?: number };
        }) | undefined;

        const normalizedState: PersistedAppState = {
          savedFormulas: typedState?.savedFormulas ?? [],
          rollHistory: (typedState?.rollHistory ?? []).slice(0, ROLL_HISTORY_STORAGE_LIMIT),
          settings: {
            theme: typedState?.settings?.theme ?? defaultSettings.theme,
            highlightLowBattery:
              typedState?.settings?.highlightLowBattery ?? defaultSettings.highlightLowBattery,
          },
          pairedPixelIds: typedState?.pairedPixelIds ?? [],
          pairedPixels: typedState?.pairedPixels ?? {},
        };

        return normalizedState;
      },
        partialize: (state) => ({
          savedFormulas: state.savedFormulas,
          rollHistory: state.rollHistory,
          // Do NOT persist the `highlightLowBattery` flag so the battery
          // highlighting does not survive app restart. Always persist the
          // theme only.
          settings: { theme: state.settings.theme, highlightLowBattery: false },
          pairedPixelIds: state.pairedPixelIds,
          pairedPixels: state.pairedPixels,
          // pixels is excluded from persist intentionally
        }),
    }
  )
);
