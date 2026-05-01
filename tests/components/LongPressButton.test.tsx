import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LongPressButton from '../../src/components/LongPressButton'

describe('LongPressButton', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('fires click on tap and long press after the threshold', () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    const onLongPress = vi.fn()

    render(
      <LongPressButton onClick={onClick} onLongPress={onLongPress}>
        Press me
      </LongPressButton>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Press me' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onLongPress).not.toHaveBeenCalled()

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Press me' }))
    vi.advanceTimersByTime(400)
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Press me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Press me' }))

    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})