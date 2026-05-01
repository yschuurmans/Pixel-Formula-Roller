import SkillListEditor from '../components/SkillListEditor'
import { useProfileEditScreenController } from '../application/profileEditScreen/useProfileEditScreenController'

export default function ProfileEditScreen() {
  const vm = useProfileEditScreenController()

  if (!vm.profile) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
        <div className="mx-auto max-w-3xl border-2 border-[#ff9aa2] bg-[#1a1421] p-5 shadow-[6px_6px_0_0_#09070d]">
          <h1 className="text-lg">{vm.notFoundMessage}</h1>
          <button type="button" onClick={vm.handleClose} className="mt-6 border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]">
            Back
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 border-2 border-[#8a72a8] bg-[#1a1421] p-4 shadow-[6px_6px_0_0_#0b0810] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Profiles</p>
            <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">{vm.pageTitle}</h1>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={vm.handleClose} className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4] shadow-[4px_4px_0_0_#09070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
              Cancel
            </button>
            <button type="button" onClick={vm.handleSave} className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
              Save
            </button>
          </div>
        </header>

        <section className="space-y-4 border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
          <div>
            <label htmlFor={`profile-name-${vm.profile.id}`} className="block text-[9px] uppercase tracking-[0.16em] text-[#c5b7d8]">
              Profile name
            </label>
            <input
              id={`profile-name-${vm.profile.id}`}
              value={vm.profile.name}
              onChange={(event) => vm.handleNameChange(event.target.value)}
              className="mt-3 w-full border-2 border-[#7d6b95] bg-[#120e17] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
            />
          </div>

          <label className="flex items-center gap-3 border-2 border-[#5d4a7a] bg-[#120e17] px-3 py-3 text-[10px] text-[#f7ead4]">
            <input
              type="checkbox"
              checked={vm.profile.isCharacter}
              onChange={(event) => vm.handleToggleCharacterMode(event.target.checked)}
              className="h-4 w-4 accent-[#86efac]"
            />
            Is a Character
          </label>

          {vm.profile.isCharacter ? (
            <SkillListEditor
              skills={vm.profile.skills}
              onAddSkill={vm.handleAddSkill}
              onRemoveSkill={vm.handleRemoveSkill}
              onUpdateLabel={vm.handleUpdateSkillLabel}
              onUpdateModifier={vm.handleUpdateSkillModifier}
              onReorderSkills={vm.handleReorderSkills}
            />
          ) : null}
        </section>
      </div>
    </main>
  )
}