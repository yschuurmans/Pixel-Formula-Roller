import DieIcon from '../components/DieIcon'
import { displayDieType } from './formulaHelpers'
import { useSettingsScreenController } from '../application/settingsScreen/useSettingsScreenController'
import { CLEANUP_DIE_ORDER, connectionStatusLabel } from '../application/settingsScreen/SettingsScreenController'

export default function SettingsScreen() {
  const vm = useSettingsScreenController()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2d2340,transparent_35%),linear-gradient(180deg,#17121d_0%,#0e0b12_100%)] px-4 py-5 text-[#f7ead4] md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 border-2 border-[#8a72a8] bg-[#1a1421] p-4 shadow-[6px_6px_0_0_#0b0810] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#c5b7d8]">Hardware Check</p>
            <h1 className="mt-3 text-lg leading-snug text-[#f7ead4]">Settings</h1>
          </div>

          <button
            type="button"
            onClick={vm.navigateHome}
            className="border-2 border-[#7d6b95] bg-[#251d2e] px-4 py-3 text-[10px] text-[#f7ead4] shadow-[4px_4px_0_0_#09070d] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            ← Back
          </button>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm text-[#f7ead4]">Connected Dice</h2>
                <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                  Use this screen to verify BLE pairing and manage connected dice before formula work.
                </p>
              </div>

              <div className="flex flex-col gap-3 md:items-end">
                <button
                  type="button"
                  onClick={() => void vm.handleConnect()}
                  disabled={!vm.bleAvailable || vm.isConnecting}
                  title={vm.bleUnavailableMessage ?? undefined}
                  className="border-2 border-[#86efac] bg-[#17301f] px-4 py-3 text-[10px] text-[#d7ffe5] shadow-[4px_4px_0_0_#09130c] transition-transform disabled:cursor-not-allowed disabled:border-[#4d5b52] disabled:bg-[#202721] disabled:text-[#8ba091] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  {vm.isConnecting ? 'Connecting…' : 'Connect new die'}
                </button>
                <button
                  type="button"
                  onClick={() => void vm.handleReconnect()}
                  disabled={!vm.bleAvailable || vm.isReconnecting || vm.pairedPixelIds.length === 0}
                  title={vm.reconnectDisabledReason ?? undefined}
                  className="border-2 border-[#7dd3fc] bg-[#102a3a] px-4 py-3 text-[10px] text-[#d9f3ff] shadow-[4px_4px_0_0_#07131a] transition-transform disabled:cursor-not-allowed disabled:border-[#4b5b63] disabled:bg-[#21272a] disabled:text-[#8d9aa0] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  {vm.isReconnecting ? 'Reconnecting…' : 'Reconnect paired dice'}
                </button>
                <button
                  type="button"
                  onClick={() => void vm.handleFlashAllDice()}
                  disabled={vm.connectedPixelIds.length === 0 || vm.isFlashingAll}
                  title={vm.connectedPixelIds.length === 0 ? 'Connect a die to flash it.' : undefined}
                  className="border-2 border-[#ffd166] bg-[#3b2a11] px-4 py-3 text-[10px] text-[#fff0bf] shadow-[4px_4px_0_0_#120c06] transition-transform disabled:cursor-not-allowed disabled:border-[#61563b] disabled:bg-[#272319] disabled:text-[#a89b76] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  {vm.isFlashingAll ? 'Flashing…' : 'Flash all dice'}
                </button>
              </div>
            </div>

            {!vm.bleAvailable && vm.bleUnavailableMessage ? (
              <div className="mb-4 border-2 border-[#ffcc66] bg-[#362813] px-4 py-3 text-[10px] leading-relaxed text-[#ffe7b3] shadow-[4px_4px_0_0_#120c06]">
                {vm.bleUnavailableMessage}
              </div>
            ) : null}

            {vm.pixelEntries.length === 0 ? (
              <div className="border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
                No dice connected — tap 'Connect new die' to get started
              </div>
            ) : (
              <ul className="space-y-3">
                {vm.pixelEntries.map((pixel) => (
                  <li
                    key={pixel.pixelId}
                    className="relative flex flex-col gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] p-3 shadow-[5px_5px_0_0_#09070d] md:flex-row md:items-center md:justify-between"
                  >
                    <span
                      aria-label={connectionStatusLabel(pixel.connectionState)}
                      title={connectionStatusLabel(pixel.connectionState)}
                      className={`absolute right-3 top-3 h-3 w-3 rounded-full border ${
                        pixel.connectionState === 'connected'
                          ? 'border-[#b7f7cd] bg-[#22c55e]'
                          : 'border-[#ffc6ce] bg-[#ef4444]'
                      }`}
                    />
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void vm.handleFlashDie(pixel.pixelId)}
                        disabled={pixel.connectionState !== 'connected'}
                        aria-label={`Flash Pixel ${pixel.pixelId.slice(-4)}`}
                        title={pixel.connectionState === 'connected' ? 'Flash die' : 'Connect the die to flash it.'}
                        className="flex h-12 w-12 items-center justify-center rounded-none border-2 border-[#ffd166] bg-[#3b2a11] text-[#fff0bf] shadow-[3px_3px_0_0_#120c06] transition-transform disabled:cursor-not-allowed disabled:border-[#61563b] disabled:bg-[#272319] disabled:text-[#a89b76] disabled:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                      >
                        <DieIcon dieType={pixel.dieType} className="h-9 w-9" />
                      </button>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-[#c5b7d8]">
                          Pixel …{pixel.pixelId.slice(-4)}
                        </p>
                        <p className="mt-2 text-[10px] text-[#f7ead4]">
                          Battery: {pixel.batteryLevel === null ? '—' : `${pixel.batteryLevel}%`}
                        </p>
                        <p className="mt-2 text-[10px] text-[#f7ead4]">
                          Last face: {pixel.lastFace ?? '—'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 md:max-w-[16rem]">
                      <button
                        type="button"
                        onClick={() => vm.handleDisconnectDie(pixel.pixelId)}
                        disabled={pixel.connectionState !== 'connected'}
                        className="border-2 border-[#fda4af] bg-[#35181f] px-4 py-3 text-[10px] text-[#ffe3e6] disabled:cursor-not-allowed disabled:border-[#5b494e] disabled:bg-[#272022] disabled:text-[#9a878c]"
                      >
                        Disconnect
                      </button>
                      <button
                        type="button"
                        onClick={() => vm.handleForgetDie(pixel.pixelId)}
                        className="border-2 border-[#ff8f66] bg-[#3c1d10] px-4 py-3 text-[10px] text-[#ffe2d6]"
                      >
                        Forget
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-6">
            <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
              <h2 className="text-sm text-[#f7ead4]">Highlight low battery dice</h2>
              <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                Cycle paired dice and indicate battery level with LEDs (red/yellow/green). Dice &gt; 80% are disconnected and not highlighted.
              </p>

              <div className="mt-4 flex items-center justify-between">
                <label className="flex items-center gap-3 text-[10px] text-[#f7ead4]">
                  <span>{vm.settings.highlightLowBattery ? 'On' : 'Off'}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Highlight low battery dice"
                    checked={!!vm.settings.highlightLowBattery}
                    onChange={(e) => vm.handleToggleHighlight(e.target.checked)}
                    className="h-5 w-5 accent-[#86efac]"
                  />
                </label>

                {vm.settings.highlightLowBattery ? (
                  <div className="text-[10px] text-[#c5b7d8]">
                    Highlighting: {vm.pairedPixelIds.length} dice — running
                    <button
                      type="button"
                      onClick={() => vm.handleToggleHighlight(false)}
                      className="ml-2 border-2 border-[#ff8f66] bg-[#3c1d10] px-2 py-1 text-[10px] text-[#ffe2d6]"
                    >
                      Stop
                    </button>
                  </div>
                ) : null}
              </div>

            </section>
            <section className="border-2 border-[#8a72a8] bg-[#15111a] p-4 shadow-[6px_6px_0_0_#09070d]">
              <h2 className="text-sm text-[#f7ead4]">Cleanup</h2>
              <p className="mt-2 text-[9px] leading-relaxed text-[#c5b7d8]">
                Enable one die type to keep reconnecting remembered dice of that type and keep them glowing until they disconnect.
              </p>

              {CLEANUP_DIE_ORDER.length === 0 ? (
                <div className="mt-4 border-2 border-dashed border-[#5d4a7a] bg-[#1b1522] px-4 py-8 text-center text-[10px] leading-relaxed text-[#c5b7d8]">
                  No cleanup types available
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {CLEANUP_DIE_ORDER.map((dieType) => {
                    const isActive = vm.activeCleanupDieType === dieType
                    const connectedCount = vm.getConnectedCountForDieType(dieType)
                    const rememberedCount = vm.getRememberedCountForDieType(dieType)

                    return (
                      <li
                        key={dieType}
                        className="flex items-center justify-between gap-4 border-2 border-[#5d4a7a] bg-[#1b1522] px-3 py-3 shadow-[4px_4px_0_0_#09070d]"
                      >
                        <div className="flex items-center gap-3">
                          <DieIcon dieType={dieType} className="h-10 w-10 text-[#fff0bf]" />
                          <div>
                            <p className="text-[10px] text-[#f7ead4]">{displayDieType(dieType)} cleanup</p>
                            <p className="mt-2 text-[9px] text-[#c5b7d8]">
                              Connected: {connectedCount} · Remembered: {rememberedCount}
                            </p>
                          </div>
                        </div>

                        <label className="flex items-center gap-3 text-[10px] text-[#f7ead4]">
                          <span>{isActive ? 'On' : 'Off'}</span>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`${displayDieType(dieType)} cleanup`}
                            checked={isActive}
                            disabled={!!vm.settings.highlightLowBattery}
                            onChange={() => vm.handleCleanupToggle(dieType)}
                            className="h-5 w-5 accent-[#86efac]"
                          />
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {vm.toast ? (
        <div className="fixed bottom-4 right-4 z-30 max-w-sm border-2 border-[#ffd166] bg-[#3a2a10] px-4 py-3 text-[10px] leading-relaxed text-[#fff0bf] shadow-[6px_6px_0_0_#120c06]">
          {vm.toast}
        </div>
      ) : null}
    </main>
  )
}
