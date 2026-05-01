import type { ReactNode, RefObject } from 'react'
import DieIcon from '../components/DieIcon'
import DieResultChip from '../components/DieResultChip'
import type { FormulaBuilderState } from '../application/rollHelpers'
import type { DisplayedRollGroup } from '../application/formulaScreen/FormulaScreenController'
import type { DieType } from '../types/formula'
import { AutoHideCountdown, displayDieType, getManualEntryConfig, getManualEntryLabel } from './formulaHelpers'
import type { RollSlot } from './availabilityHelpers'

type KeepMode = 'kh' | 'kl'

type FormulaScreenHeaderProps = {
  isEditing: boolean
  onBack: () => void
  onDelete: () => void
}

export function FormulaScreenHeader({ isEditing, onBack, onDelete }: FormulaScreenHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-2 border-[#8a72a8] bg-[#1a1421] p-4 shadow-[6px_6px_0_0_#0b0810] md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Builder</p>
        <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">
          {isEditing ? 'Edit Formula' : 'New Formula'}
        </h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4] shadow-[4px_4px_0_0_#09070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          ← Back
        </button>

        {isEditing ? (
          <button
            type="button"
            onClick={onDelete}
            className="border-2 border-[#ff9aa2] bg-[#35181f] px-4 py-3 text-[10px] text-[#ffe3e6] shadow-[4px_4px_0_0_#12070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            Delete
          </button>
        ) : null}
      </div>
    </header>
  )
}

type FormulaNameSectionProps = {
  name: string
  nameError: string | null
  isAwaitingRolls: boolean
  onNameChange: (value: string) => void
}

export function FormulaNameSection({
  name,
  nameError,
  isAwaitingRolls,
  onNameChange,
}: FormulaNameSectionProps) {
  return (
    <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
      <label htmlFor="formula-name" className="block text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">
        Formula Name
      </label>
      <input
        id="formula-name"
        type="text"
        placeholder="Formula name"
        value={name}
        disabled={isAwaitingRolls}
        onChange={(event) => onNameChange(event.target.value)}
        className="mt-3 w-full border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
      />
      {nameError ? <p className="mt-3 text-[10px] text-[#ff9aa2]">{nameError}</p> : null}
    </section>
  )
}

type DicePickerSectionProps = {
  builderState: FormulaBuilderState
  displayDieOrder: DieType[]
  keepDice: DieType[]
  keepErrors: Partial<Record<DieType, string>>
  isAwaitingRolls: boolean
  onCountChange: (dieType: DieType, delta: number) => void
  onKeepModeChange: (dieType: DieType, mode: KeepMode) => void
  onKeepValueChange: (dieType: DieType, value: string) => void
  onKeepPreset: (dieType: DieType, mode: KeepMode) => void
}

export function DicePickerSection({
  builderState,
  displayDieOrder,
  keepDice,
  keepErrors,
  isAwaitingRolls,
  onCountChange,
  onKeepModeChange,
  onKeepValueChange,
  onKeepPreset,
}: DicePickerSectionProps) {
  return (
    <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm text-[#f7ead4]">Dice Picker</h2>
          <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
            Pick dice visually or type the full expression below.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
        {displayDieOrder.map((dieType) => {
          const entry = builderState.dice[dieType]

          return (
            <div
              key={dieType}
              className="flex min-w-0 flex-col items-center gap-1.5 rounded-[14px] border-2 border-[#5d4a7a] bg-[#1b1522] px-1 py-2 shadow-[3px_3px_0_0_#09070d]"
            >
              <button
                type="button"
                aria-label={`Add ${displayDieType(dieType)}`}
                disabled={isAwaitingRolls}
                onClick={() => onCountChange(dieType, 1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#86efac] bg-[#17301f] text-sm leading-none text-[#d7ffe5] disabled:cursor-not-allowed disabled:border-[#4d5b52] disabled:bg-[#202721] disabled:text-[#8ba091]"
              >
                +
              </button>

              <div className="flex h-10 w-10 items-center justify-center">
                <DieIcon dieType={dieType} className="h-10 w-10" />
              </div>

              <div
                aria-label={`Count for ${displayDieType(dieType)}`}
                className="min-w-0 rounded-full border-2 border-[#4f3f63] bg-[#120e17] px-2 py-1 text-center text-[10px] text-[#f7ead4]"
              >
                {entry.count}
              </div>

              <button
                type="button"
                aria-label={`Remove ${displayDieType(dieType)}`}
                disabled={entry.count === 0}
                onClick={() => onCountChange(dieType, -1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#7d6b95] bg-[#251d2e] text-sm leading-none text-[#f7ead4] disabled:cursor-not-allowed disabled:border-[#494355] disabled:bg-[#221d28] disabled:text-[#807a8c]"
              >
                -
              </button>
            </div>
          )
        })}
      </div>

      {keepDice.length > 0 ? (
        <div className="mt-5 border-t border-[#4f3f63] pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[10px] uppercase tracking-[0.16em] text-[#c5b7d8]">Keep Dice</h3>
            <p className="text-[9px] text-[#8ba091]">Only shown for counts of 2 or more</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {displayDieOrder.filter((dieType) => keepDice.includes(dieType)).map((dieType) => {
              const entry = builderState.dice[dieType]
              const keepError = keepErrors[dieType]

              return (
                <div
                  key={`keep-${dieType}`}
                  className="rounded-[14px] border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[3px_3px_0_0_#09070d]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center">
                      <DieIcon dieType={dieType} className="h-10 w-10" />
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[#f7ead4]">
                        {displayDieType(dieType)} keep
                      </p>
                      <p className="mt-1 text-[9px] text-[#c5b7d8]">{entry.count} dice selected</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-end gap-3">
                    <div>
                      <label
                        htmlFor={`keep-mode-${dieType}`}
                        className="block text-[9px] uppercase tracking-[0.16em] text-[#c5b7d8]"
                      >
                        Keep
                      </label>
                      <select
                        id={`keep-mode-${dieType}`}
                        aria-label={`Keep mode for ${displayDieType(dieType)}`}
                        value={entry.keepMode}
                        disabled={isAwaitingRolls}
                        onChange={(event) => onKeepModeChange(dieType, event.target.value as KeepMode)}
                        className="mt-2 border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
                      >
                        <option value="kh">kh</option>
                        <option value="kl">kl</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor={`keep-count-${dieType}`}
                        className="block text-[9px] uppercase tracking-[0.16em] text-[#c5b7d8]"
                      >
                        N
                      </label>
                      <input
                        id={`keep-count-${dieType}`}
                        aria-label={`Keep count for ${displayDieType(dieType)}`}
                        type="number"
                        min={1}
                        max={entry.count}
                        placeholder="off"
                        value={entry.keepN}
                        disabled={isAwaitingRolls}
                        onChange={(event) => onKeepValueChange(dieType, event.target.value)}
                        className="mt-2 w-20 border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 self-end">
                      <button
                        type="button"
                        aria-label={`Set advantage for ${displayDieType(dieType)}`}
                        disabled={isAwaitingRolls}
                        onClick={() => onKeepPreset(dieType, 'kh')}
                        className="rounded-full border border-[#86efac] bg-[#17301f] px-3 py-2 text-[9px] text-[#d7ffe5] disabled:cursor-not-allowed disabled:border-[#4d5b52] disabled:bg-[#202721] disabled:text-[#8ba091]"
                      >
                        Adv
                      </button>
                      <button
                        type="button"
                        aria-label={`Set disadvantage for ${displayDieType(dieType)}`}
                        disabled={isAwaitingRolls}
                        onClick={() => onKeepPreset(dieType, 'kl')}
                        className="rounded-full border border-[#ff9aa2] bg-[#35181f] px-3 py-2 text-[9px] text-[#ffe3e6] disabled:cursor-not-allowed disabled:border-[#5b494e] disabled:bg-[#272022] disabled:text-[#9a878c]"
                      >
                        Dis
                      </button>
                    </div>
                  </div>

                  {keepError ? <p className="mt-3 text-[10px] text-[#ff9aa2]">{keepError}</p> : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </section>
  )
}

type FormulaInputsSectionProps = {
  formulaText: string
  formulaError: string | null
  flatModifier: number
  isAwaitingRolls: boolean
  onFormulaTextChange: (value: string) => void
  onFormulaBlur: () => void
  onFlatModifierChange: (value: string) => void
}

export function FormulaInputsSection({
  formulaText,
  formulaError,
  flatModifier,
  isAwaitingRolls,
  onFormulaTextChange,
  onFormulaBlur,
  onFlatModifierChange,
}: FormulaInputsSectionProps) {
  return (
    <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px] md:items-end">
        <div>
          <label htmlFor="formula-text" className="block text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">
            Formula
          </label>
          <input
            id="formula-text"
            type="text"
            value={formulaText}
            disabled={isAwaitingRolls}
            onChange={(event) => onFormulaTextChange(event.target.value)}
            onBlur={onFormulaBlur}
            className="mt-3 w-full border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 font-mono text-[11px] text-[#f7ead4] outline-none"
          />
          {formulaError ? <p className="mt-3 text-[10px] text-[#ff9aa2]">{formulaError}</p> : null}
        </div>

        <div>
          <label htmlFor="flat-modifier" className="block text-[10px] uppercase tracking-[0.18em] text-[#c5b7d8]">
            Flat Modifier
          </label>
          <input
            id="flat-modifier"
            type="number"
            min={-9999}
            max={9999}
            value={flatModifier}
            disabled={isAwaitingRolls}
            onChange={(event) => onFlatModifierChange(event.target.value)}
            className="mt-3 w-full border-2 border-[#7d6b95] bg-[#1b1522] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
          />
        </div>
      </div>
    </section>
  )
}

type RollEngineSectionProps = {
  rollEngineRef: RefObject<HTMLElement | null>
  currentSequentialSlot: RollSlot | null
  isAwaitingRolls: boolean
  isRollOnly: boolean
  statusMessage: string | null
  completedTotal: number | null
  onCancelRoll: () => void
  onRollAgain: () => void
  rollSessionPresent: boolean
  displayedRollsByDieType: DisplayedRollGroup[]
  pendingManualSlots: RollSlot[]
  manualInputs: Record<string, string>
  manualInputErrors: Record<string, string>
  manualSubmitDisabled: boolean
  onPromptPendingRoll: (rollId: string) => void
  onManualInputChange: (slotId: string, value: string) => void
  onSubmitManualRolls: () => void
}

export function RollEngineSection({
  rollEngineRef,
  currentSequentialSlot,
  isAwaitingRolls,
  isRollOnly,
  statusMessage,
  completedTotal,
  onCancelRoll,
  onRollAgain,
  rollSessionPresent,
  displayedRollsByDieType,
  pendingManualSlots,
  manualInputs,
  manualInputErrors,
  manualSubmitDisabled,
  onPromptPendingRoll,
  onManualInputChange,
  onSubmitManualRolls,
}: RollEngineSectionProps) {
  return (
    <section ref={rollEngineRef} className="border-2 border-[#4f94ff] bg-[#10192f] p-4 shadow-[6px_6px_0_0_#07101f]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          {currentSequentialSlot ? (
            <p role="status" className="text-[10px] text-[#d8e6ff]">
              Roll {displayDieType(currentSequentialSlot.logicalDieType)} - {currentSequentialSlot.logicalSequence} of {currentSequentialSlot.sequentialTotal}
            </p>
          ) : isAwaitingRolls ? (
            <p role="status" className="text-[10px] text-[#d8e6ff]">
              Awaiting roll results...
            </p>
          ) : isRollOnly ? (
            <p role="status" className="text-[10px] text-[#d8e6ff]">
              Preparing roll...
            </p>
          ) : (
            <p role="status" className="text-[10px] text-[#d8e6ff]">
              Press Roll to start collecting results.
            </p>
          )}
          {statusMessage ? <p className="mt-2 text-[10px] text-[#ffe7b3]">{statusMessage}</p> : null}
          {completedTotal !== null ? <p className="mt-2 text-[10px] text-[#86efac]">Total: {completedTotal}</p> : null}
        </div>

        {isAwaitingRolls ? (
          <button
            type="button"
            onClick={onCancelRoll}
            className="border-2 border-[#ff9aa2] bg-[#35181f] px-4 py-3 text-[10px] text-[#ffe3e6] shadow-[4px_4px_0_0_#12070d]"
          >
            Cancel roll
          </button>
        ) : completedTotal !== null ? (
          <button
            type="button"
            onClick={onRollAgain}
            className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c]"
          >
            Roll Again
          </button>
        ) : null}
      </div>

      {rollSessionPresent ? (
        <div className="mt-4 border-t border-[#35518a] pt-4">
          <h3 className="text-[10px] uppercase tracking-[0.16em] text-[#c5d7ff]">Rolled dice</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {displayedRollsByDieType.flatMap(({ rolls }) =>
              rolls.map((roll) => (
                <DieResultChip
                  key={roll.id}
                  dieType={roll.dieType}
                  face={roll.face}
                  pending={roll.pending}
                  dropped={roll.dropped}
                  onClick={roll.pending && isAwaitingRolls ? () => onPromptPendingRoll(roll.id) : undefined}
                  ariaLabel={
                    roll.pending
                      ? `${displayDieType(roll.dieType)} #${roll.sequence} pending`
                      : `${displayDieType(roll.dieType)} #${roll.sequence} result ${roll.face}${roll.dropped ? ' dropped' : ''}`
                  }
                />
              )),
            )}
          </div>
        </div>
      ) : null}

      {pendingManualSlots.length > 0 ? (
        <div className="mt-4 border-t border-[#35518a] pt-4">
          <h3 className="text-[10px] uppercase tracking-[0.16em] text-[#c5d7ff]">Manual entry</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {pendingManualSlots.map((slot) => (
              <div key={slot.id}>
                <label htmlFor={slot.id} className="block text-[10px] text-[#d8e6ff]">
                  {getManualEntryLabel(slot)}
                </label>
                <input
                  id={slot.id}
                  type="number"
                  inputMode="numeric"
                  min={getManualEntryConfig(slot).min}
                  max={getManualEntryConfig(slot).max}
                  step={getManualEntryConfig(slot).step}
                  value={manualInputs[slot.id] ?? ''}
                  onChange={(event) => onManualInputChange(slot.id, event.target.value)}
                  className="mt-2 w-full border-2 border-[#4f94ff] bg-[#0d162a] px-3 py-3 text-[10px] text-[#f7ead4] outline-none"
                />
                {manualInputErrors[slot.id] ? <p className="mt-2 text-[10px] text-[#ffcc66]">{manualInputErrors[slot.id]}</p> : null}
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={manualSubmitDisabled}
              onClick={onSubmitManualRolls}
              className="border-2 border-[#ffd166] bg-[#3b2a11] px-4 py-3 text-[10px] text-[#fff0bf] shadow-[4px_4px_0_0_#120c06] disabled:cursor-not-allowed disabled:border-[#6a614d] disabled:bg-[#282318] disabled:text-[#a89d7c] disabled:shadow-none"
            >
              Submit manual rolls
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type FormulaScreenActionsProps = {
  rollDisabled: boolean
  saveDisabled: boolean
  onRoll: () => void
  onSave: () => void
}

export function FormulaScreenActions({ rollDisabled, saveDisabled, onRoll, onSave }: FormulaScreenActionsProps) {
  return (
    <section className="flex flex-wrap justify-end gap-3 border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
      <button
        type="button"
        disabled={rollDisabled}
        onClick={onRoll}
        className="border-2 border-[#4f94ff] bg-[#102043] px-4 py-3 text-[10px] text-[#d8e6ff] shadow-[4px_4px_0_0_#07101f] disabled:cursor-not-allowed disabled:border-[#4a5569] disabled:bg-[#1d2230] disabled:text-[#8d96a5] disabled:shadow-none"
      >
        Roll
      </button>
      <button
        type="button"
        disabled={saveDisabled}
        onClick={onSave}
        className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c] disabled:cursor-not-allowed disabled:border-[#4d5b52] disabled:bg-[#202721] disabled:text-[#8ba091] disabled:shadow-none"
      >
        Save
      </button>
    </section>
  )
}

type RollOnlyScreenProps = {
  name: string
  formulaText: string
  autoHideRemainingMs: number | null
  onClose: () => void
  rollEngineSection: ReactNode
}

export function RollOnlyScreen({ name, formulaText, autoHideRemainingMs, onClose, rollEngineSection }: RollOnlyScreenProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-4xl items-center justify-center">
        <section className="relative w-full border-2 border-[#8a72a8] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]">
          <div className="mb-5 flex items-start justify-between gap-4 pr-16">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Roll Only</p>
              <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">{name || 'Saved Formula'}</h1>
              <p className="mt-3 font-mono text-[11px] text-[#d8cef1]">{formulaText}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4] shadow-[4px_4px_0_0_#09070d]"
            >
              Close
            </button>
          </div>

          {autoHideRemainingMs !== null ? (
            <div className="absolute right-4 top-4">
              <AutoHideCountdown remainingMs={autoHideRemainingMs} durationMs={10_000} />
            </div>
          ) : null}

          {rollEngineSection}
        </section>
      </div>
    </main>
  )
}

type ConfirmDialogProps = {
  title: string
  body: string
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  borderClassName: string
  confirmClassName: string
}

export function ConfirmDialog({
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  borderClassName,
  confirmClassName,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-md border-2 bg-[#1a1421] p-5 shadow-[8px_8px_0_0_#09070d] ${borderClassName}`}
      >
        <h2 className="text-sm text-[#f7ead4]">{title}</h2>
        <p className="mt-4 text-[10px] leading-relaxed text-[#d8cef1]">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={confirmClassName}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}