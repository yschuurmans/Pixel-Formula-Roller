import LongPressButton from './LongPressButton';
import type { Profile, ProfileSkill } from '../types/profile';

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
    <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">Character Sheet</p>
          <h2 className="mt-3 text-sm text-[#f7ead4]">{profile.name}</h2>
        </div>
        <p className="text-[9px] text-[#c5b7d8]">Tap for a check, long-press for advantage</p>
      </div>

      {profile.skills.length === 0 ? (
        <div className="mt-4 border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
          No skills are configured for this character yet.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {profile.skills.map((skill) => (
            <div key={skill.id} className="border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[4px_4px_0_0_#09070d]">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#c5b7d8]">{skill.label}</p>
              <LongPressButton
                type="button"
                onClick={() => onTapSkill(skill)}
                onLongPress={() => onLongPressSkill(skill)}
                className="mt-3 w-full border-2 border-[#7dd3fc] bg-[#102a3a] px-4 py-3 text-sm text-[#d9f3ff] shadow-[4px_4px_0_0_#07131a] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                {formatModifier(skill.modifier)}
              </LongPressButton>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}