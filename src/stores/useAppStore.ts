import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DieType, EvaluationResult, ParsedFormula } from '../types/formula';

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
  name: string;
  dieType: DieType;
  connected: boolean;
}

interface AppState {
  savedFormulas: SavedFormula[];
  rollHistory: RollHistoryEntry[];
  settings: AppSettings;
  pixels: Record<string, PixelEntry>;
}

interface AppActions {
  setSavedFormulas: (formulas: SavedFormula[]) => void;
  addSavedFormula: (formula: SavedFormula) => void;
  updateSavedFormula: (id: string, updates: Partial<SavedFormula>) => void;
  deleteSavedFormula: (id: string) => void;
  addRollHistory: (entry: RollHistoryEntry) => void;
  clearRollHistory: () => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  setPixel: (id: string, entry: PixelEntry) => void;
  removePixel: (id: string) => void;
}

const defaultSettings: AppSettings = {
  historyLength: 50,
  theme: 'dark',
};

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set) => ({
      savedFormulas: [],
      rollHistory: [],
      settings: defaultSettings,
      pixels: {},

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
      setPixel: (id, entry) =>
        set((state) => ({ pixels: { ...state.pixels, [id]: entry } })),
      removePixel: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.pixels;
          return { pixels: rest };
        }),
    }),
    {
      name: 'pixel-formula-roller',
      partialize: (state) => ({
        savedFormulas: state.savedFormulas,
        rollHistory: state.rollHistory,
        settings: state.settings,
        // pixels is excluded from persist intentionally
      }),
    }
  )
);
