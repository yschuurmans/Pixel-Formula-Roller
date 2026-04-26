export type DieType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

export interface DiceGroup {
  dieType: DieType;
  count: number;
  keep?: { mode: "kh" | "kl"; n: number };
}

export interface ParsedFormula {
  groups: DiceGroup[];
  flatModifier: number;
  raw: string;
  canonical: string;
}

export interface RequiredDie {
  dieType: DieType;
  count: number;
  keep?: { mode: "kh" | "kl"; n: number };
}

export interface DieRollResult {
  dieType: DieType;
  face: number;
  kept: boolean;
  source: "ble" | "manual";
}

export interface GroupResult {
  dieType: DieType;
  rolls: DieRollResult[];
}

export interface EvaluationResult {
  groups: GroupResult[];
  flatModifier: number;
  total: number;
}

export interface PickerState {
  dice: Partial<Record<DieType, { count: number; keep?: { mode: "kh" | "kl"; n: number } }>>;
  flatModifier: number;
}
