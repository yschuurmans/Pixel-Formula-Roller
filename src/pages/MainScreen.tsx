import { formatDistanceToNow } from 'date-fns'
import {
  ROLL_HISTORY_STORAGE_LIMIT,
} from '../stores/useAppStore'
import type { DieRollResult } from '../types/formula'
import DieResultChip from '../components/DieResultChip'
import { displayDieType } from './formulaHelpers'
import { useMainScreenController } from '../application/mainScreen/useMainScreenController'

function ConnectIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17a5 5 0 0 1 0-7l2-2" />
      <path d="M15 7a5 5 0 0 1 0 7l-2 2" />
      <path d="M10 14l4-4" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 1-6.36 2.64" opacity="0.35" />
      <path d="M12 3a9 9 0 0 1 6.36 2.64" />
    </svg>
  )
}

function HistoryItem({
  label,
  total,
  rolledAt,
  onClick,
}: {
  label: string
  total: number
  rolledAt: number
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start justify-between gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] px-3 py-3 text-left shadow-[4px_4px_0_0_#09070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-[#f7ead4]">{label}</p>
          <p className="mt-2 text-[9px] text-[#c5b7d8]">
            {formatDistanceToNow(rolledAt, { addSuffix: true })}
          </p>
        </div>
        <p className="text-sm text-[#ffd166]">{total}</p>
      </button>
    </li>
  )
}

function formatRollLabel(roll: DieRollResult, index: number): string {
  const baseLabel = `${displayDieType(roll.dieType)} #${index + 1}`
  return roll.kept ? `${baseLabel} result ${roll.face}` : `${baseLabel} result ${roll.face} dropped`
}

export default function MainScreen() {
  const vm = useMainScreenController()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        {vm.bannerMessage ? (
          <div className="mb-4 border-2 border-[#ffcc66] bg-[#362813] px-4 py-3 text-[10px] leading-relaxed text-[#ffe7b3] shadow-[4px_4px_0_0_#120c06]">
            {vm.bannerMessage}
          </div>
        ) : null}

        <header className="mb-6 flex flex-col gap-4 border-2 border-[#8a72a8] bg-[#1a1421] p-4 shadow-[6px_6px_0_0_#0b0810] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Pixels Roller</p>
            <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">{vm.activeProfile?.name ?? 'Default'}</h1>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={vm.navigateToNewFormula}
              className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              + New
            </button>
            <button
              type="button"
              onClick={vm.navigateToProfiles}
              aria-label="Open profiles"
              className="border-2 border-[#ffd166] bg-[#3b2a11] px-4 py-3 text-[10px] text-[#fff0bf] shadow-[4px_4px_0_0_#120c06] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Profiles
            </button>
            <button
              type="button"
              onClick={vm.handleQuickConnectClick}
              onMouseDown={vm.handleQuickConnectHoldStart}
              onMouseUp={vm.handleQuickConnectHoldEnd}
              onMouseLeave={vm.handleQuickConnectHoldEnd}
              onTouchStart={vm.handleQuickConnectHoldStart}
              onTouchEnd={vm.handleQuickConnectHoldEnd}
              onTouchCancel={vm.handleQuickConnectHoldEnd}
              disabled={!vm.bleAvailable || vm.isQuickConnecting}
              aria-label={vm.isQuickConnecting ? 'Connecting dice' : 'Connect new die'}
              title={vm.bannerMessage ?? 'Connect new die'}
              className="flex h-[42px] w-[42px] items-center justify-center border-2 border-[#7dd3fc] bg-[#102a3a] text-[#d9f3ff] shadow-[4px_4px_0_0_#07131a] transition-transform disabled:cursor-not-allowed disabled:border-[#4b5b63] disabled:bg-[#21272a] disabled:text-[#8d9aa0] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {vm.isQuickConnecting ? <SpinnerIcon /> : <ConnectIcon />}
            </button>
            <button
              type="button"
              onClick={vm.navigateToSettings}
              aria-label="Open settings"
              className="border-2 border-[#f8a5c2] bg-[#351826] px-4 py-3 text-[10px] text-[#ffe0ec] shadow-[4px_4px_0_0_#12070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              ⚙
            </button>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm text-[#f7ead4]">Saved Formulas</h2>
              <p className="text-[9px] text-[#c5b7d8]">Tap a card to roll</p>
            </div>

            {vm.savedFormulas.length === 0 ? (
              <div className="border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
                No saved formulas yet — tap + to add one
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {vm.savedFormulas.map((formula) => (
                  <article
                    key={formula.id}
                    className="relative border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[5px_5px_0_0_#09070d]"
                  >
                    <button
                      type="button"
                      onClick={() => vm.openFormulaMenu(formula.id)}
                      aria-label={`More options for ${formula.name}`}
                      className="absolute right-2 top-2 border border-[#7d6b95] bg-[#2b2136] px-2 py-1 text-xs leading-none text-[#f7ead4]"
                    >
                      ⋮
                    </button>

                    {vm.activeMenuId === formula.id ? (
                      <div className="absolute right-2 top-10 z-10 min-w-30 border-2 border-[#8a72a8] bg-[#110d16] shadow-[4px_4px_0_0_#09070d]">
                        <button
                          type="button"
                          onClick={() => {
                            vm.closeFormulaMenu()
                            vm.navigateToEditFormula(formula.id)
                          }}
                          className="block w-full border-b border-[#4d3d61] px-3 py-3 text-left text-[10px] text-[#f7ead4] hover:bg-[#241b2d]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            vm.closeFormulaMenu()
                            vm.openDeleteDialog(formula)
                          }}
                          className="block w-full px-3 py-3 text-left text-[10px] text-[#ff9aa2] hover:bg-[#241b2d]"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        vm.closeFormulaMenu()
                        vm.navigateToRollFormula(formula.id)
                      }}
                      className="block w-full pr-8 text-left"
                    >
                      <h3 className="text-sm leading-snug text-[#f7ead4]">{formula.name}</h3>
                      <p className="mt-4 font-mono text-xs text-[#d8cef1]">{formula.formula}</p>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm text-[#f7ead4]">Roll History</h2>
              <button
                type="button"
                onClick={vm.openHistoryDialog}
                className="text-[9px] text-[#c5b7d8] underline underline-offset-2"
              >
                See more
              </button>
            </div>

            {vm.recentHistory.length === 0 ? (
              <div className="border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] text-[#c5b7d8]">
                No rolls yet
              </div>
            ) : (
              <ol className="space-y-3">
                {vm.recentHistory.map((entry) => (
                  <HistoryItem
                    key={entry.id}
                    label={entry.formulaName || entry.formulaString}
                    total={entry.total}
                    rolledAt={entry.rolledAt}
                    onClick={() => vm.openHistoryEntry(entry)}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {vm.isProfileManagerOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl border-2 border-[#7dd3fc] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">Profiles</p>
                <h2 className="mt-3 text-sm text-[#f7ead4]">Manage profile sets</h2>
                <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                  Switch formulas and roll history without changing settings or BLE connections.
                </p>
              </div>
              <button
                type="button"
                onClick={vm.closeProfileManager}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-3 py-2 text-[10px] text-[#f7ead4]"
              >
                Close
              </button>
            </div>

            {vm.profileError ? (
              <div className="mt-4 border-2 border-[#ffcc66] bg-[#362813] px-4 py-3 text-[10px] leading-relaxed text-[#ffe7b3]">
                {vm.profileError}
              </div>
            ) : null}

            <div className="mt-5 border-2 border-[#5d4a7a] bg-[#1b1522] p-4">
              <label className="block text-[10px] uppercase tracking-[0.16em] text-[#c5b7d8]">
                Create profile
              </label>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input
                  value={vm.newProfileName}
                  onChange={(event) => vm.setNewProfileName(event.target.value)}
                  placeholder="New profile name"
                  className="min-w-0 flex-1 border-2 border-[#7d6b95] bg-[#110d16] px-3 py-3 text-[10px] text-[#f7ead4] outline-none placeholder:text-[#7c7190]"
                />
                <button
                  type="button"
                  onClick={vm.createProfileFromInput}
                  className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5]"
                >
                  Create
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {vm.profileList.map((profile) => {
                const isActive = profile.id === vm.activeProfileId
                const isRenaming = vm.renamingProfile?.id === profile.id

                return (
                  <article
                    key={profile.id}
                    className={`border-2 px-3 py-3 shadow-[4px_4px_0_0_#09070d] ${isActive ? 'border-[#ffd166] bg-[#2a2111]' : 'border-[#5d4a7a] bg-[#1b1522]'}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[#c5b7d8]">
                          {isActive ? 'Active' : 'Profile'}
                        </p>
                        <h3 className="mt-2 text-sm text-[#f7ead4]">{profile.name}</h3>
                        <p className="mt-2 text-[9px] text-[#c5b7d8]">
                          {profile.formulas.length} formulas · {profile.history.length} rolls
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => vm.handleSelectProfile(profile.id)}
                          disabled={isActive}
                          className="border-2 border-[#7dd3fc] bg-[#102a3a] px-3 py-2 text-[10px] text-[#d9f3ff] disabled:cursor-not-allowed disabled:border-[#4b5b63] disabled:bg-[#21272a] disabled:text-[#8d9aa0]"
                        >
                          {isActive ? 'Selected' : 'Select'}
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.startRenameProfile(profile)}
                          className="border-2 border-[#f8a5c2] bg-[#351826] px-3 py-2 text-[10px] text-[#ffe0ec]"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.requestDeleteProfile(profile)}
                          className="border-2 border-[#ff8f66] bg-[#3c1d10] px-3 py-2 text-[10px] text-[#ffe2d6]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {isRenaming ? (
                      <div className="mt-4 border-2 border-[#7d6b95] bg-[#110d16] p-3">
                        <label className="block text-[10px] uppercase tracking-[0.16em] text-[#c5b7d8]">
                          Rename profile
                        </label>
                        <div className="mt-3 flex flex-col gap-3 md:flex-row">
                          <input
                            value={vm.renameProfileName}
                            onChange={(event) => vm.setRenameProfileName(event.target.value)}
                            className="min-w-0 flex-1 border-2 border-[#7d6b95] bg-[#1a1421] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
                          />
                          <button
                            type="button"
                            onClick={vm.saveRenameProfile}
                            className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5]"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={vm.cancelRenameProfile}
                            className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {vm.profileToDelete ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md border-2 border-[#ff9aa2] bg-[#1a1421] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <h2 className="text-sm text-[#f7ead4]">Delete profile?</h2>
            <p className="mt-4 text-[10px] leading-relaxed text-[#d8cef1]">
              '{vm.profileToDelete.name}' and its formula history will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={vm.cancelDeleteProfile}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={vm.confirmDeleteProfile}
                className="border-2 border-[#ff6b6b] bg-[#4a1515] px-4 py-3 text-[10px] text-[#ffe1e1]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {vm.formulaToDelete ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md border-2 border-[#ff9aa2] bg-[#1a1421] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <h2 className="text-sm text-[#f7ead4]">Delete formula?</h2>
            <p className="mt-4 text-[10px] leading-relaxed text-[#d8cef1]">
              '{vm.formulaToDelete.name}' will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={vm.closeDeleteDialog}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={vm.deleteFormula}
                className="border-2 border-[#ff6b6b] bg-[#4a1515] px-4 py-3 text-[10px] text-[#ffe1e1]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {vm.selectedHistoryEntry ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl border-2 border-[#4f94ff] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">Roll Details</p>
                <h2 className="mt-3 text-sm text-[#f7ead4]">{vm.selectedHistoryEntry.formulaName || vm.selectedHistoryEntry.formulaString}</h2>
              </div>

              <button
                type="button"
                onClick={vm.closeHistoryEntry}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
              <div className="border-2 border-[#5d4a7a] bg-[#1b1522] p-4 shadow-[4px_4px_0_0_#09070d]">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">Formula</p>
                <p className="mt-3 font-mono text-[11px] text-[#d8cef1]">{vm.selectedHistoryEntry.formulaString}</p>
              </div>

              <div className="border-2 border-[#ffd166] bg-[#3b2a11] p-4 text-center shadow-[4px_4px_0_0_#120c06]">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#fff0bf]">Total</p>
                <p className="mt-3 text-lg text-[#fff0bf]">{vm.selectedHistoryEntry.total}</p>
              </div>
            </div>

            <div className="mt-5 border-2 border-[#5d4a7a] bg-[#1b1522] p-4 shadow-[4px_4px_0_0_#09070d]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">Dice Results</h3>
                <p className="text-[9px] text-[#c5b7d8]">
                  {formatDistanceToNow(vm.selectedHistoryEntry.rolledAt, { addSuffix: true })}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {vm.selectedHistoryEntry.result.groups.flatMap((group) =>
                  group.rolls.map((roll, index) => (
                    <DieResultChip
                      key={`roll-${group.dieType}-${index}-${roll.face}`}
                      dieType={roll.dieType}
                      face={roll.face}
                      dropped={!roll.kept}
                      ariaLabel={formatRollLabel(roll, index)}
                    />
                  )),
                )}

                {vm.selectedHistoryEntry.result.flatModifier !== 0 ? (
                  <div className="basis-full border-t border-[#4d3d61] pt-4 text-[10px] text-[#c5b7d8]">
                    Flat modifier: {vm.selectedHistoryEntry.result.flatModifier > 0 ? `+${vm.selectedHistoryEntry.result.flatModifier}` : vm.selectedHistoryEntry.result.flatModifier}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {vm.isHistoryDialogOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-3xl border-2 border-[#8a72a8] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">Roll History</p>
                <h2 className="mt-3 text-sm text-[#f7ead4]">Last {ROLL_HISTORY_STORAGE_LIMIT} rolls</h2>
              </div>

              <button
                type="button"
                onClick={vm.closeHistoryDialog}
                className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
              >
                Close
              </button>
            </div>

            {vm.fullHistory.length === 0 ? (
              <div className="mt-5 border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] text-[#c5b7d8]">
                No rolls yet
              </div>
            ) : (
              <ol className="mt-5 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                {vm.fullHistory.map((entry) => (
                  <HistoryItem
                    key={entry.id}
                    label={entry.formulaName || entry.formulaString}
                    total={entry.total}
                    rolledAt={entry.rolledAt}
                    onClick={() => {
                      vm.closeHistoryDialog()
                      vm.openHistoryEntry(entry)
                    }}
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}

      {vm.toast ? (
        <div className="fixed bottom-4 right-4 z-30 max-w-sm border-2 border-[#ffd166] bg-[#3a2a10] px-4 py-3 text-[10px] leading-relaxed text-[#fff0bf] shadow-[6px_6px_0_0_#120c06]">
          {vm.toast.message}
        </div>
      ) : null}
    </main>
  )
}
