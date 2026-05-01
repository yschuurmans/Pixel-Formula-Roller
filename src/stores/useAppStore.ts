import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DieType } from '../types/formula';
import type { Profile, ProfileSkill, RollHistoryEntry, SavedFormula } from '../types/profile';

export type { Profile, ProfileSkill, RollHistoryEntry, SavedFormula } from '../types/profile';

export const STORAGE_WARNING_EVENT = 'pixel-formula-roller:storage-warning';
export const STORAGE_WARNING_MESSAGE = 'Storage full - oldest history entries will be removed';
export const ROLL_HISTORY_PREVIEW_LIMIT = 5;
export const ROLL_HISTORY_STORAGE_LIMIT = 50;
export const PROFILE_DEFAULT_ID = 'default';
export const PROFILE_DEFAULT_NAME = 'Default';

type PersistedAppState = Pick<
  AppState,
  | 'profiles'
  | 'activeProfileId'
  | 'settings'
  | 'pairedPixelIds'
  | 'pairedPixels'
>;

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
  profiles: Record<string, Profile>;
  activeProfileId: string;
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
  createProfile: (name: string) => string | null;
  renameProfile: (profileId: string, name: string) => boolean;
  setProfileCharacterMode: (profileId: string, isCharacter: boolean) => boolean;
  addProfileSkill: (profileId: string, skill?: Partial<ProfileSkill>) => string | null;
  updateProfileSkillLabel: (profileId: string, skillId: string, label: string) => boolean;
  updateProfileSkillModifier: (profileId: string, skillId: string, modifier: number) => boolean;
  removeProfileSkill: (profileId: string, skillId: string) => boolean;
  reorderProfileSkills: (profileId: string, activeSkillId: string, overSkillId: string) => boolean;
  deleteProfile: (profileId: string) => boolean;
  selectProfile: (profileId: string) => boolean;
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

const DEFAULT_CHARACTER_SKILLS: Array<Pick<ProfileSkill, 'label' | 'modifier'>> = [
  { label: 'STR', modifier: 0 },
  { label: 'DEX', modifier: 0 },
  { label: 'CON', modifier: 0 },
  { label: 'INT', modifier: 0 },
  { label: 'WIS', modifier: 0 },
  { label: 'CHA', modifier: 0 },
  { label: 'Acrobatics', modifier: 0 },
  { label: 'Animal Handling', modifier: 0 },
  { label: 'Arcana', modifier: 0 },
  { label: 'Athletics', modifier: 0 },
  { label: 'Deception', modifier: 0 },
  { label: 'History', modifier: 0 },
  { label: 'Insight', modifier: 0 },
  { label: 'Intimidation', modifier: 0 },
  { label: 'Investigation', modifier: 0 },
  { label: 'Medicine', modifier: 0 },
  { label: 'Nature', modifier: 0 },
  { label: 'Perception', modifier: 0 },
  { label: 'Performance', modifier: 0 },
  { label: 'Persuasion', modifier: 0 },
  { label: 'Religion', modifier: 0 },
  { label: 'Sleight of Hand', modifier: 0 },
  { label: 'Stealth', modifier: 0 },
  { label: 'Survival', modifier: 0 },
];

function createProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `profile-${Date.now()}`;
}

function createSkillId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `skill-${Date.now()}`;
}

function createDefaultCharacterSkills(): ProfileSkill[] {
  return DEFAULT_CHARACTER_SKILLS.map((skill) => ({
    id: createSkillId(),
    label: skill.label,
    modifier: skill.modifier,
  }));
}

function createProfileRecord(name: string, overrides: Partial<Profile> = {}): Profile {
  const now = overrides.updatedAt ?? overrides.createdAt ?? Date.now();
  const isCharacter = overrides.isCharacter ?? false;
  const skills = overrides.skills ? overrides.skills.map((skill) => ({ ...skill })) : [];

  return {
    id: overrides.id ?? createProfileId(),
    name: name.trim() || PROFILE_DEFAULT_NAME,
    isCharacter,
    skills: isCharacter && skills.length === 0 ? createDefaultCharacterSkills() : skills,
    formulas: overrides.formulas ?? [],
    history: (overrides.history ?? []).slice(0, ROLL_HISTORY_STORAGE_LIMIT),
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function createDefaultProfile(overrides: Partial<Profile> = {}): Profile {
  return createProfileRecord(PROFILE_DEFAULT_NAME, {
    id: PROFILE_DEFAULT_ID,
    ...overrides,
  });
}

function normalizeProfile(
  profileId: string,
  profile: Partial<Profile> & {
    formulas?: SavedFormula[];
    history?: RollHistoryEntry[];
    savedFormulas?: SavedFormula[];
    rollHistory?: RollHistoryEntry[];
    skills?: ProfileSkill[];
  } = {},
): Profile {
  const isCharacter = profile.isCharacter ?? false;
  const skills = profile.skills ? profile.skills.map((skill) => ({ ...skill })) : [];

  return createProfileRecord(profile.name ?? PROFILE_DEFAULT_NAME, {
    id: profile.id ?? profileId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    isCharacter,
    skills: isCharacter && skills.length === 0 ? createDefaultCharacterSkills() : skills,
    formulas: profile.formulas ?? profile.savedFormulas ?? [],
    history: (profile.history ?? profile.rollHistory ?? []).slice(0, ROLL_HISTORY_STORAGE_LIMIT),
  });
}

function getProfileById(profiles: Record<string, Profile>, profileId: string): Profile | null {
  return profiles[profileId] ?? null;
}

function getPreferredProfile(profiles: Record<string, Profile>, activeProfileId: string): Profile {
  return profiles[activeProfileId] ?? profiles[PROFILE_DEFAULT_ID] ?? Object.values(profiles)[0] ?? createDefaultProfile();
}

export function getActiveProfileState(
  state: Pick<AppState, 'profiles' | 'activeProfileId'> & Partial<Pick<AppState, 'savedFormulas' | 'rollHistory'>>,
): Profile | null {
  return getProfileById(state.profiles, state.activeProfileId) ?? getPreferredProfile(state.profiles, state.activeProfileId);
}

function getProfileView(profile: Profile): Pick<AppState, 'savedFormulas' | 'rollHistory'> {
  return {
    savedFormulas: [...profile.formulas],
    rollHistory: [...profile.history],
  };
}

function getFallbackProfile(profiles: Record<string, Profile>, excludedProfileId: string): Profile {
  const remainingProfiles = Object.values(profiles).filter((profile) => profile.id !== excludedProfileId);
  return remainingProfiles.find((profile) => profile.id === PROFILE_DEFAULT_ID) ?? remainingProfiles[0] ?? createDefaultProfile();
}

function hasProfileName(profiles: Record<string, Profile>, profileId: string | null, name: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  if (normalizedName === '') {
    return true;
  }

  return Object.values(profiles).some((profile) => profile.id !== profileId && profile.name.trim().toLowerCase() === normalizedName);
}

function updateActiveProfile(
  state: AppState,
  updater: (profile: Profile) => Profile,
): Pick<AppState, 'profiles' | 'activeProfileId' | 'savedFormulas' | 'rollHistory'> {
  const currentProfile = getPreferredProfile(state.profiles, state.activeProfileId);
  const nextProfile = updater(currentProfile);

  return {
    profiles: {
      ...state.profiles,
      [nextProfile.id]: nextProfile,
    },
    activeProfileId: nextProfile.id,
    ...getProfileView(nextProfile),
  };
}

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
          state?: PersistedAppState & {
            savedFormulas?: SavedFormula[];
            rollHistory?: RollHistoryEntry[];
          };
          version?: number;
        };
        const trimLimit = Math.max(1, Math.floor(ROLL_HISTORY_STORAGE_LIMIT / 2));
        const trimmedProfiles = Object.fromEntries(
          Object.entries(persisted.state?.profiles ?? {}).map(([profileId, profile]) => [
            profileId,
            {
              ...profile,
              history: (profile.history ?? []).slice(0, trimLimit),
            },
          ]),
        );

        dispatchStorageWarning();

        localStorage.setItem(
          name,
          JSON.stringify({
            ...persisted,
            state: {
              ...persisted.state,
              profiles:
                Object.keys(trimmedProfiles).length > 0
                  ? trimmedProfiles
                  : {
                      [PROFILE_DEFAULT_ID]: {
                        ...createDefaultProfile(),
                        formulas:
                          persisted.state?.profiles?.[PROFILE_DEFAULT_ID]?.formulas ?? persisted.state?.savedFormulas ?? [],
                        history:
                          persisted.state?.profiles?.[PROFILE_DEFAULT_ID]?.history ?? persisted.state?.rollHistory ?? [],
                      },
                    },
              activeProfileId: persisted.state?.activeProfileId ?? PROFILE_DEFAULT_ID,
              settings: persisted.state?.settings ?? defaultSettings,
              pairedPixelIds: persisted.state?.pairedPixelIds ?? [],
              pairedPixels: persisted.state?.pairedPixels ?? {},
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
      profiles: {
        [PROFILE_DEFAULT_ID]: createDefaultProfile(),
      },
      activeProfileId: PROFILE_DEFAULT_ID,
      savedFormulas: [],
      rollHistory: [],
      settings: defaultSettings,
      pairedPixelIds: [],
      pairedPixels: {},
      pixels: {},
      bleAvailable: true,
      bleError: null,

      setSavedFormulas: (formulas) =>
        set((state) => updateActiveProfile(state, (profile) => ({
          ...profile,
          formulas,
          updatedAt: Date.now(),
        }))),
      addSavedFormula: (formula) =>
        set((state) => updateActiveProfile(state, (profile) => ({
          ...profile,
          formulas: [...profile.formulas, formula],
          updatedAt: Date.now(),
        }))),
      updateSavedFormula: (id, updates) =>
        set((state) => updateActiveProfile(state, (profile) => ({
          ...profile,
          formulas: profile.formulas.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
          updatedAt: Date.now(),
        }))),
      deleteSavedFormula: (id) =>
        set((state) => updateActiveProfile(state, (profile) => ({
          ...profile,
          formulas: profile.formulas.filter((f) => f.id !== id),
          updatedAt: Date.now(),
        }))),
      addRollHistory: (entry) =>
        set((state) => updateActiveProfile(state, (profile) => ({
          ...profile,
          history: [entry, ...profile.history].slice(0, ROLL_HISTORY_STORAGE_LIMIT),
          updatedAt: Date.now(),
        }))),
      clearRollHistory: () =>
        set((state) => updateActiveProfile(state, (profile) => ({
          ...profile,
          history: [],
          updatedAt: Date.now(),
        }))),
      createProfile: (name) => {
        const trimmedName = name.trim();

        if (trimmedName === '') {
          return null;
        }

        let createdProfileId: string | null = null;
        set((state) => {
          if (hasProfileName(state.profiles, null, trimmedName)) {
            return state;
          }

          const profile = createProfileRecord(trimmedName);
          createdProfileId = profile.id;

          return {
            profiles: {
              ...state.profiles,
              [profile.id]: profile,
            },
            activeProfileId: profile.id,
            ...getProfileView(profile),
          };
        });

        return createdProfileId;
      },
      renameProfile: (profileId, name) => {
        const trimmedName = name.trim();

        if (trimmedName === '') {
          return false;
        }

        let renamed = false;
        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile || hasProfileName(state.profiles, profileId, trimmedName)) {
            return state;
          }

          renamed = true;
          const nextProfile = {
            ...profile,
            name: trimmedName,
            updatedAt: Date.now(),
          };

          return {
            ...state,
            profiles: {
              ...state.profiles,
              [profileId]: nextProfile,
            },
            ...(state.activeProfileId === profileId ? getProfileView(nextProfile) : {}),
          };
        });

        return renamed;
      },
      setProfileCharacterMode: (profileId, isCharacter) => {
        let updated = false;

        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile || profile.isCharacter === isCharacter) {
            return state;
          }

          updated = true;
          const nextProfile = {
            ...profile,
            isCharacter,
            skills: isCharacter && profile.skills.length === 0 ? createDefaultCharacterSkills() : profile.skills,
            updatedAt: Date.now(),
          };

          return {
            ...state,
            profiles: {
              ...state.profiles,
              [profileId]: nextProfile,
            },
            ...(state.activeProfileId === profileId ? getProfileView(nextProfile) : {}),
          };
        });

        return updated;
      },
      addProfileSkill: (profileId, skill = {}) => {
        let createdSkillId: string | null = null;

        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile) {
            return state;
          }

          const nextSkill = {
            id: skill.id ?? createSkillId(),
            label: skill.label?.trim() || 'New Skill',
            modifier: Number.isFinite(skill.modifier) ? Math.trunc(skill.modifier as number) : 0,
          } satisfies ProfileSkill;

          createdSkillId = nextSkill.id;
          const nextProfile = {
            ...profile,
            isCharacter: true,
            skills: [...profile.skills, nextSkill],
            updatedAt: Date.now(),
          };

          return {
            ...state,
            profiles: {
              ...state.profiles,
              [profileId]: nextProfile,
            },
            ...(state.activeProfileId === profileId ? getProfileView(nextProfile) : {}),
          };
        });

        return createdSkillId;
      },
      updateProfileSkillLabel: (profileId, skillId, label) => {
        let updated = false;

        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile) {
            return state;
          }

          const trimmedLabel = label.trim();
          if (trimmedLabel === '') {
            return state;
          }

          const nextSkills = profile.skills.map((skill) => (skill.id === skillId ? { ...skill, label: trimmedLabel } : skill));
          const changed = nextSkills.some((skill, index) => skill !== profile.skills[index]);
          if (!changed) {
            return state;
          }

          updated = true;
          const nextProfile = {
            ...profile,
            isCharacter: true,
            skills: nextSkills,
            updatedAt: Date.now(),
          };

          return {
            ...state,
            profiles: {
              ...state.profiles,
              [profileId]: nextProfile,
            },
            ...(state.activeProfileId === profileId ? getProfileView(nextProfile) : {}),
          };
        });

        return updated;
      },
      updateProfileSkillModifier: (profileId, skillId, modifier) => {
        let updated = false;

        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile) {
            return state;
          }

          const nextModifier = Number.isFinite(modifier) ? Math.trunc(modifier) : 0;
          const nextSkills = profile.skills.map((skill) => (skill.id === skillId ? { ...skill, modifier: nextModifier } : skill));
          const changed = nextSkills.some((skill, index) => skill !== profile.skills[index]);
          if (!changed) {
            return state;
          }

          updated = true;
          const nextProfile = {
            ...profile,
            isCharacter: true,
            skills: nextSkills,
            updatedAt: Date.now(),
          };

          return {
            ...state,
            profiles: {
              ...state.profiles,
              [profileId]: nextProfile,
            },
            ...(state.activeProfileId === profileId ? getProfileView(nextProfile) : {}),
          };
        });

        return updated;
      },
      removeProfileSkill: (profileId, skillId) => {
        let removed = false;

        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile) {
            return state;
          }

          const nextSkills = profile.skills.filter((skill) => skill.id !== skillId);
          if (nextSkills.length === profile.skills.length) {
            return state;
          }

          removed = true;
          const nextProfile = {
            ...profile,
            isCharacter: true,
            skills: nextSkills,
            updatedAt: Date.now(),
          };

          return {
            ...state,
            profiles: {
              ...state.profiles,
              [profileId]: nextProfile,
            },
            ...(state.activeProfileId === profileId ? getProfileView(nextProfile) : {}),
          };
        });

        return removed;
      },
      reorderProfileSkills: (profileId, activeSkillId, overSkillId) => {
        let reordered = false;

        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile || activeSkillId === overSkillId) {
            return state;
          }

          const fromIndex = profile.skills.findIndex((skill) => skill.id === activeSkillId);
          const toIndex = profile.skills.findIndex((skill) => skill.id === overSkillId);
          if (fromIndex < 0 || toIndex < 0) {
            return state;
          }

          const nextSkills = [...profile.skills];
          const [movedSkill] = nextSkills.splice(fromIndex, 1);
          nextSkills.splice(toIndex, 0, movedSkill);

          reordered = true;
          const nextProfile = {
            ...profile,
            isCharacter: true,
            skills: nextSkills,
            updatedAt: Date.now(),
          };

          return {
            ...state,
            profiles: {
              ...state.profiles,
              [profileId]: nextProfile,
            },
            ...(state.activeProfileId === profileId ? getProfileView(nextProfile) : {}),
          };
        });

        return reordered;
      },
      deleteProfile: (profileId) => {
        let deleted = false;

        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile || Object.keys(state.profiles).length <= 1) {
            return state;
          }

          deleted = true;
          const nextProfiles = { ...state.profiles };
          delete nextProfiles[profileId];

          const fallbackProfile = getFallbackProfile(nextProfiles, profileId);
          const nextActiveProfileId = state.activeProfileId === profileId ? fallbackProfile.id : state.activeProfileId;

          return {
            ...state,
            profiles: nextProfiles,
            activeProfileId: nextActiveProfileId,
            ...(state.activeProfileId === profileId ? getProfileView(fallbackProfile) : {}),
          };
        });

        return deleted;
      },
      selectProfile: (profileId) => {
        let selected = false;

        set((state) => {
          const profile = state.profiles[profileId];
          if (!profile || state.activeProfileId === profileId) {
            return state;
          }

          selected = true;
          return {
            ...state,
            activeProfileId: profileId,
            ...getProfileView(profile),
          };
        });

        return selected;
      },
      rememberPairedPixelId: (pixelId) =>
        set((state) => ({
          pairedPixelIds: state.pairedPixelIds.includes(pixelId)
            ? state.pairedPixelIds
            : [...state.pairedPixelIds, pixelId],
        })),
      rememberPairedPixel: (entry) =>
        set((state) => {
          const existing = state.pairedPixels[entry.pixelId];

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
          };
        }),
      markPairedPixelUsed: (pixelId, usedAt = Date.now()) =>
        set((state) => {
          const existing = state.pairedPixels[pixelId];
          if (!existing) {
            return state;
          }

          return {
            pairedPixels: {
              ...state.pairedPixels,
              [pixelId]: {
                ...existing,
                lastUsedAt: usedAt,
              },
            },
          };
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
          const current = state.pixels[id];
          if (!current) {
            return state;
          }

          return {
            pixels: {
              ...state.pixels,
              [id]: { ...current, ...updates },
            },
          };
        }),
      removePixel: (id) =>
        set((state) => {
          const { [id]: _removedPixel, ...rest } = state.pixels;
          return { pixels: rest };
        }),
      setBleError: (error) => set({ bleError: error }),
      clearBleError: () => set({ bleError: null }),
      setSettings: (settings) => set({ settings }),
    }),
    {
      name: 'pixel-formula-roller',
      version: 4,
      storage: appStorage,
      migrate: (persistedState, _version) => {
        const typedState = persistedState as (Partial<PersistedAppState> & {
          settings?: Partial<AppSettings> & { historyLength?: number };
          savedFormulas?: SavedFormula[];
          rollHistory?: RollHistoryEntry[];
          profiles?: Record<string, Partial<Profile> & {
            formulas?: SavedFormula[];
            history?: RollHistoryEntry[];
            savedFormulas?: SavedFormula[];
            rollHistory?: RollHistoryEntry[];
            skills?: ProfileSkill[];
          }>;
        }) | undefined;

        const migratedProfiles = typedState?.profiles && Object.keys(typedState.profiles).length > 0
          ? Object.fromEntries(
              Object.entries(typedState.profiles).map(([profileId, profile]) => [
                profileId,
                normalizeProfile(profileId, profile),
              ]),
            )
          : {
              [PROFILE_DEFAULT_ID]: createDefaultProfile({
                formulas: typedState?.savedFormulas ?? [],
                history: (typedState?.rollHistory ?? []).slice(0, ROLL_HISTORY_STORAGE_LIMIT),
              }),
            };

        const activeProfileId = migratedProfiles[typedState?.activeProfileId ?? PROFILE_DEFAULT_ID]
          ? typedState?.activeProfileId ?? PROFILE_DEFAULT_ID
          : Object.keys(migratedProfiles)[0] ?? PROFILE_DEFAULT_ID;
        const activeProfile = migratedProfiles[activeProfileId] ?? createDefaultProfile();

        return {
          profiles: migratedProfiles,
          activeProfileId,
          savedFormulas: [...activeProfile.formulas],
          rollHistory: [...activeProfile.history],
          settings: {
            theme: typedState?.settings?.theme ?? defaultSettings.theme,
            highlightLowBattery:
              typedState?.settings?.highlightLowBattery ?? defaultSettings.highlightLowBattery,
          },
          pairedPixelIds: typedState?.pairedPixelIds ?? [],
          pairedPixels: typedState?.pairedPixels ?? {},
        };
      },
      partialize: (state) => ({
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
        settings: { theme: state.settings.theme, highlightLowBattery: false },
        pairedPixelIds: state.pairedPixelIds,
        pairedPixels: state.pairedPixels,
      }),
    }
  )
);
