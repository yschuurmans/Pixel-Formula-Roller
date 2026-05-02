import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RollOptionsModal from '../../src/components/AdvantagePrompt'

describe('RollOptionsModal', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('focuses the first option and restores focus when closed', async () => {
    function renderHarness(open: boolean) {
      return (
        <>
          <button type="button">Before modal</button>
          <RollOptionsModal
            open={open}
            title="Saved Formula"
            eyebrow="Saved Formula"
            description="Choose how to launch this saved formula."
            options={[
              { choice: 'normal', label: 'Normal Roll', detail: '1d20+3', tone: 'neutral', icon: { kind: 'dice', dieType: 'd20' } },
              { choice: 'doubleDice', label: 'Double Dice', detail: '2d20+3', tone: 'good', icon: { kind: 'dice', dieType: 'd20', count: 2, badge: 'x2' } },
              { choice: 'doubleAll', label: 'Double All', detail: '(1d20+3)*2', tone: 'bad', icon: { kind: 'dice', dieType: 'd20', count: 2, badge: 'x2 ALL' } },
            ]}
            onChoose={() => undefined}
            onClose={() => undefined}
          />
        </>
      )
    }

    const { rerender } = render(renderHarness(false))

    const beforeButton = screen.getByRole('button', { name: 'Before modal' })
    beforeButton.focus()

    rerender(renderHarness(true))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '✕' })).toHaveFocus()
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    rerender(renderHarness(false))

    await waitFor(() => {
      expect(beforeButton).toHaveFocus()
    })
  })
})