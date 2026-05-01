import LongPressButton from './LongPressButton';
import type { Profile, ProfileSkill } from '../types/profile';
import { partitionSkillsByColumn } from '../utils/profileSkills';

function formatModifier(modifier: number): string {
  return modifier > 0 ? `+${modifier}` : String(modifier);
}

export default function CharacterSheet({
  profile,
  onTapSkill,
  onLongPressSkill,
}: {
  profile: Profile;
  onTapSkill: (skill: ProfileSkill) => void;
  onLongPressSkill: (skill: ProfileSkill) => void;
}) {
  return (
    <section className="space-y-2 rounded-sm border border-[#8a72a8] bg-[#15111a] p-3 shadow-[5px_5px_0_0_#09070d]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[7px] uppercase tracking-[0.18em] text-[#c5d7ff]">Character Sheet</p>
          <h2 className="mt-1 text-[9px] text-[#f7ead4]">{profile.name}</h2>
        </div>
        <p className="text-[7px] text-[#c5b7d8]">Tap for a check, long-press for advantage</p>
      </div>

      {profile.skills.length === 0 ? (
        <div className="text-center text-[7px] leading-relaxed text-[#c5b7d8]">
          No skills are configured for this character yet.
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-2">
          {(() => {
            const { left: leftSkills, right: rightSkills } = partitionSkillsByColumn(profile.skills)

            const SkillColumn = ({ columnSkills }: { columnSkills: ProfileSkill[] }) => (
              <div className="space-y-1.5 min-w-0">
                {columnSkills.map((skill) => (
                  <div key={skill.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 px-1 py-1">
                    <p className="truncate text-[7px] uppercase tracking-[0.16em] text-[#c5b7d8]">{skill.label}</p>
                    <LongPressButton
                      type="button"
                      onClick={() => onTapSkill(skill)}
                      onLongPress={() => onLongPressSkill(skill)}
                      className="min-w-10 shrink-0 border border-[#7dd3fc] bg-[#102a3a] px-2 py-1 text-[7px] text-[#d9f3ff] shadow-[2px_2px_0_0_#07131a] transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    >
                      {formatModifier(skill.modifier)}
                    </LongPressButton>
                  </div>
                ))}
              </div>
            )

            return (
              <>
                <SkillColumn columnSkills={leftSkills} />
                <div className="bg-[#4d3d61]" aria-hidden="true" />
                <SkillColumn columnSkills={rightSkills} />
              </>
            )
          })()}
        </div>
      )}
    </section>
  );
}