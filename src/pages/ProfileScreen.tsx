import { useProfileScreenController } from '../application/profileScreen/useProfileScreenController'
import type { Profile } from '../stores/useAppStore'

function ProfileCard({
  profile,
  isActive,
  isEditing,
  editValue,
  editError,
  onEditValue,
  onBeginRename,
  onCancelRename,
  onSaveRename,
  onDelete,
  onSelect,
}: {
  profile: Profile
  isActive: boolean
  isEditing: boolean
  editValue: string
  editError: string | null
  onEditValue: (value: string) => void
  onBeginRename: () => void
  onCancelRename: () => void
  onSaveRename: () => void
  onDelete: () => void
  onSelect: () => void
}) {
  return (
    <article className={`border-2 bg-[#1b1522] p-4 shadow-[5px_5px_0_0_#09070d] ${isActive ? 'border-[#86efac]' : 'border-[#5d4a7a]'}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div>
              <label htmlFor={`profile-name-${profile.id}`} className="block text-[9px] uppercase tracking-[0.16em] text-[#c5b7d8]">
                Rename profile
              </label>
              <input
                id={`profile-name-${profile.id}`}
                value={editValue}
                onChange={(event) => onEditValue(event.target.value)}
                className="mt-3 w-full border-2 border-[#7d6b95] bg-[#120e17] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
              />
              {editError ? <p className="mt-3 text-[10px] text-[#ff9aa2]">{editError}</p> : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm text-[#f7ead4]">{profile.name}</h3>
                {isActive ? <span className="border border-[#86efac] px-2 py-1 text-[9px] text-[#d7ffe5]">Active</span> : null}
              </div>
              <p className="mt-2 text-[9px] text-[#c5b7d8]">
                {(profile.formulas?.length ?? 0)} formulas · {(profile.history?.length ?? 0)} rolls
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {isEditing ? (
            <>
              <button type="button" onClick={onCancelRename} className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]">
                Cancel
              </button>
              <button type="button" onClick={onSaveRename} className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5]">
                Save
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onSelect} disabled={isActive} className="border-2 border-[#7dd3fc] bg-[#102a3a] px-4 py-3 text-[10px] text-[#d9f3ff] disabled:cursor-not-allowed disabled:border-[#4b5b63] disabled:bg-[#21272a] disabled:text-[#8d9aa0]">
                {isActive ? 'Selected' : 'Select'}
              </button>
              <button type="button" onClick={onBeginRename} className="border-2 border-[#f8a5c2] bg-[#351826] px-4 py-3 text-[10px] text-[#ffe0ec]">
                Rename
              </button>
              <button type="button" onClick={onDelete} className="border-2 border-[#ff9aa2] bg-[#4a1515] px-4 py-3 text-[10px] text-[#ffe1e1]">
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export default function ProfileScreen() {
  const vm = useProfileScreenController()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 border-2 border-[#8a72a8] bg-[#1a1421] p-4 shadow-[6px_6px_0_0_#0b0810] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Saved Contexts</p>
            <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">Profiles</h1>
            <p className="mt-2 text-[9px] text-[#c5b7d8]">Active profile: {vm.activeProfileLabel}</p>
          </div>

          <button
            type="button"
            onClick={vm.navigateHome}
            className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4] shadow-[4px_4px_0_0_#09070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            ← Back
          </button>
        </header>

        <section className="mb-6 border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
          <h2 className="text-sm text-[#f7ead4]">Create profile</h2>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="new-profile-name" className="block text-[9px] uppercase tracking-[0.16em] text-[#c5b7d8]">
                Name
              </label>
              <input
                id="new-profile-name"
                value={vm.newProfileName}
                onChange={(event) => vm.setNewProfileName(event.target.value)}
                placeholder="Campaign A"
                className="mt-3 w-full border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
              />
              {vm.newProfileError ? <p className="mt-3 text-[10px] text-[#ff9aa2]">{vm.newProfileError}</p> : null}
            </div>

            <button
              type="button"
              onClick={vm.handleCreateProfile}
              className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Create
            </button>
          </div>
        </section>

        <section className="space-y-4 border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm text-[#f7ead4]">Profiles</h2>
            <p className="text-[9px] text-[#c5b7d8]">Switching profiles updates the active formula set and history only.</p>
          </div>

          {vm.profileList.length === 0 ? (
            <div className="border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
              No profiles available
            </div>
          ) : (
            <div className="space-y-3">
              {vm.profileList.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  isActive={profile.id === vm.activeProfile?.id}
                  isEditing={vm.editingProfile?.id === profile.id}
                  editValue={vm.editingProfile?.id === profile.id ? vm.editingProfileName : profile.name}
                  editError={vm.editingProfile?.id === profile.id ? vm.editingProfileError : null}
                  onEditValue={vm.setEditingProfileName}
                  onBeginRename={() => vm.handleBeginRename(profile)}
                  onCancelRename={vm.handleCancelRename}
                  onSaveRename={vm.handleSaveRename}
                  onDelete={() => vm.handleRequestDelete(profile)}
                  onSelect={() => vm.handleSelectProfile(profile.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {vm.deleteTarget ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md border-2 border-[#ff9aa2] bg-[#1a1421] p-5 shadow-[8px_8px_0_0_#09070d]">
            <h2 className="text-sm text-[#f7ead4]">Delete profile?</h2>
            <p className="mt-4 text-[10px] leading-relaxed text-[#d8cef1]">
              '{vm.deleteTarget.name}' will be removed along with its formulas and roll history.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={vm.handleCancelDelete} className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]">
                Cancel
              </button>
              <button type="button" onClick={vm.handleConfirmDelete} disabled={vm.isDeleteDisabled} className="border-2 border-[#ff6b6b] bg-[#4a1515] px-4 py-3 text-[10px] text-[#ffe1e1] disabled:cursor-not-allowed disabled:border-[#5b494e] disabled:bg-[#272022] disabled:text-[#9a878c]">
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}