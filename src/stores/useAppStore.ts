import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DieType, EvaluationResult, ParsedFormula } from '../types/formula';

export const STORAGE_WARNING_EVENT = 'pixel-formula-roller:storage-warning';
export const STORAGE_WARNING_MESSAGE = 'Storage full — oldest history entries will be removed';

type PersistedAppState = Pick<AppState, 'savedFormulas' | 'rollHistory' | 'settings' | 'pairedPixelIds'>;

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
  historyLength: number;
  theme: 'dark';
}

export interface PixelEntry {
  pixelId: string;
  dieType: DieType;
  connectionState: 'connected' | 'disconnected';
  batteryLevel: number | null;
  lastFace: number | null;
}

interface AppState {
  savedFormulas: SavedFormula[];
  rollHistory: RollHistoryEntry[];
  settings: AppSettings;
  pairedPixelIds: string[];
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
  updateSettings: (updates: Partial<AppSettings>) => void;
  rememberPairedPixelId: (pixelId: string) => void;
  addPixel: (entry: PixelEntry) => void;
  updatePixelState: (id: string, updates: Partial<PixelEntry>) => void;
  removePixel: (id: string) => void;
  setBleError: (error: string | null) => void;
  clearBleError: () => void;
}

const defaultSettings: AppSettings = {
  historyLength: 5,
  theme: 'dark',
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
        const historyLength = persisted.state?.settings.historyLength ?? defaultSettings.historyLength;
        const trimmedHistory = (persisted.state?.rollHistory ?? []).slice(
          0,
          Math.max(1, Math.floor(historyLength / 2)),
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
          rollHistory: [entry, ...state.rollHistory].slice(0, state.settings.historyLength),
        })),
      clearRollHistory: () => set({ rollHistory: [] }),
      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),
      rememberPairedPixelId: (pixelId) =>
        set((state) => ({
          pairedPixelIds: state.pairedPixelIds.includes(pixelId)
            ? state.pairedPixelIds
            : [...state.pairedPixelIds, pixelId],
        })),
      addPixel: (entry) =>
        set((state) => ({ pixels: { ...state.pixels, [entry.pixelId]: entry } })),
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
    }),
    {
      name: 'pixel-formula-roller',
      version: 1,
      storage: appStorage,
      migrate: (persistedState, version) => {
        const typedState = persistedState as Partial<PersistedAppState> | undefined;

        const normalizedState: PersistedAppState = {
          savedFormulas: typedState?.savedFormulas ?? [],
          rollHistory: typedState?.rollHistory ?? [],
          settings: typedState?.settings ?? defaultSettings,
          pairedPixelIds: typedState?.pairedPixelIds ?? [],
        };

        if (version < 1 && normalizedState.settings.historyLength === 50) {
          return {
            ...normalizedState,
            settings: {
              ...normalizedState.settings,
              historyLength: defaultSettings.historyLength,
            },
          };
        }

        return normalizedState;
      },
      partialize: (state) => ({
        savedFormulas: state.savedFormulas,
        rollHistory: state.rollHistory,
        settings: state.settings,
        pairedPixelIds: state.pairedPixelIds,
        // pixels is excluded from persist intentionally
      }),
    }
  )
);
