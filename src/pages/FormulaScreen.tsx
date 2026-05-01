import { Navigate } from 'react-router-dom'
import {
  ConfirmDialog,
  DicePickerSection,
  FormulaInputsSection,
  FormulaNameSection,
  FormulaScreenActions,
  FormulaScreenHeader,
  RollEngineSection,
  RollOnlyScreen,
} from './FormulaScreenSections'
import ResultPanel from '../components/ResultPanel'
import { useFormulaScreenController } from '../application/formulaScreen/useFormulaScreenController'
import type { FormulaScreenMode } from '../application/formulaScreen/FormulaScreenController'

export default function FormulaScreen({ mode = 'builder' }: { mode?: FormulaScreenMode }) {
  const vm = useFormulaScreenController(mode)

  if (vm.navigationIntent) {
    return (
      <Navigate
        to="/"
        replace={vm.navigationIntent.replace}
        state={{ toastMessage: vm.navigationIntent.message }}
      />
    )
  }

  if (vm.rollOnlyAutoHideExpired) {
    return <Navigate to="/" replace />
  }

  const rollEngineSection = vm.showRollEngine && !vm.isResultPanelOpen ? (
    <RollEngineSection
      rollEngineRef={vm.rollEngineRef}
      currentSequentialSlot={vm.currentSequentialSlot}
      isAwaitingRolls={vm.isAwaitingRolls}
      isRollOnly={vm.isRollOnly}
      statusMessage={vm.statusMessage}
      completedTotal={vm.completedRollResult?.total ?? null}
      onCancelRoll={() => void vm.handleCancelRoll()}
      onRollAgain={() => void vm.handleRoll()}
      rollSessionPresent={vm.hasRollSession}
      displayedRollsByDieType={vm.displayedRollsByDieType}
      pendingManualSlots={vm.pendingManualSlots}
      manualInputs={vm.manualInputs}
      manualInputErrors={vm.manualInputErrors}
      manualSubmitDisabled={vm.manualSubmitDisabled}
      onPromptPendingRoll={(rollId) => {
        void vm.promptGlowForRoll(rollId)
      }}
      onManualInputChange={vm.handleManualInputChange}
      onSubmitManualRolls={() => void vm.handleSubmitManualRolls()}
    />
  ) : null

  const resultPanel = vm.completedRollResult ? (
    <ResultPanel
      open={vm.isResultPanelOpen}
      formulaName={vm.name.trim() || undefined}
      formulaString={vm.formulaText}
      result={vm.completedRollResult}
      onRollAgain={() => void vm.handleRoll()}
      onClose={vm.isRollOnly ? vm.navigateHome : vm.closeResultPanel}
      autoHideRemainingMs={vm.autoHideRemainingMs}
      autoHideDurationMs={10_000}
    />
  ) : null

  if (vm.isRollOnly) {
    if (vm.completedRollResult) {
      return resultPanel
    }

    return (
      <RollOnlyScreen
        name={vm.name}
        formulaText={vm.formulaText}
        autoHideRemainingMs={vm.autoHideRemainingMs}
        onClose={vm.navigateHome}
        rollEngineSection={rollEngineSection}
      />
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto max-w-4xl">
        <FormulaScreenHeader
          isEditing={vm.isEditing}
          onBack={vm.navigateHome}
          onProfiles={vm.navigateToProfiles}
          onDelete={vm.openDeleteDialog}
        />

        <div className="space-y-6">
          <FormulaNameSection
            name={vm.name}
            nameError={vm.nameError}
            isAwaitingRolls={vm.isAwaitingRolls}
            onNameChange={vm.handleNameChange}
          />

          <DicePickerSection
            builderState={vm.builderState}
            displayDieOrder={[...vm.displayDieOrder]}
            keepDice={vm.keepDice}
            keepErrors={vm.keepErrors}
            isAwaitingRolls={vm.isAwaitingRolls}
            onCountChange={vm.handleCountChange}
            onKeepModeChange={vm.handleKeepModeChange}
            onKeepValueChange={vm.handleKeepValueChange}
            onKeepPreset={vm.handleKeepPreset}
          />

          <FormulaInputsSection
            formulaText={vm.formulaText}
            formulaError={vm.formulaError}
            flatModifier={vm.builderState.flatModifier}
            isAwaitingRolls={vm.isAwaitingRolls}
            onFormulaTextChange={vm.handleFormulaTextChange}
            onFormulaBlur={vm.handleFormulaBlur}
            onFlatModifierChange={vm.handleFlatModifierChange}
          />

          {rollEngineSection}
          {resultPanel}

          <FormulaScreenActions
            rollDisabled={vm.rollDisabled}
            saveDisabled={!vm.isReady || vm.firstKeepError !== null || vm.isAwaitingRolls}
            onRoll={() => void vm.handleRoll()}
            onSave={vm.handleSave}
          />
        </div>
      </div>

      {vm.showDeleteDialog && vm.existingFormula ? (
        <ConfirmDialog
          title="Delete formula?"
          body={`'${vm.existingFormula.name}' will be permanently removed.`}
          cancelLabel="Cancel"
          confirmLabel="Delete"
          onCancel={vm.closeDeleteDialog}
          onConfirm={vm.handleDelete}
          borderClassName="border-[#ff9aa2]"
          confirmClassName="border-2 border-[#ff6b6b] bg-[#4a1515] px-4 py-3 text-[10px] text-[#ffe1e1]"
        />
      ) : null}

      {vm.blocker.state === 'blocked' ? (
        <ConfirmDialog
          title="Discard changes?"
          body="You have unsaved edits on this formula."
          cancelLabel="Keep editing"
          confirmLabel="Discard"
          onCancel={() => vm.blocker.reset?.()}
          onConfirm={() => vm.blocker.proceed?.()}
          borderClassName="border-[#ffd166]"
          confirmClassName="border-2 border-[#ffd166] bg-[#3b2a11] px-4 py-3 text-[10px] text-[#fff0bf]"
        />
      ) : null}
    </main>
  )
}
