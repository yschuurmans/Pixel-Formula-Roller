import type { ProfileSkill } from '../types/profile';

export type SkillColumn = 'left' | 'right';

export const DEFAULT_CHARACTER_SKILL_COLUMN: SkillColumn = 'right';

export function getSkillColumn(skill: Pick<ProfileSkill, 'column'>): SkillColumn {
  return skill.column ?? 'left';
}

export function partitionSkillsByColumn(skills: ProfileSkill[]): { left: ProfileSkill[]; right: ProfileSkill[] } {
  return skills.reduce(
    (accumulator, skill) => {
      accumulator[getSkillColumn(skill)].push(skill);
      return accumulator;
    },
    { left: [] as ProfileSkill[], right: [] as ProfileSkill[] },
  );
}

export function normalizeLegacySkillColumns(skills: ProfileSkill[], defaultColumn: SkillColumn = 'left'): ProfileSkill[] {
  if (skills.length === 0) {
    return [];
  }

  const hasExplicitColumns = skills.some((skill) => skill.column !== undefined);
  if (hasExplicitColumns) {
    return skills.map((skill) => ({
      ...skill,
      column: skill.column ?? defaultColumn,
    }));
  }

  const splitIndex = Math.ceil(skills.length / 2);
  return skills.map((skill, index) => ({
    ...skill,
    column: index < splitIndex ? 'left' : 'right',
  }));
}