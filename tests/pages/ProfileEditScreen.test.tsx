import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfileEditScreen from '../../src/pages/ProfileEditScreen'
import { useAppStore } from '../../src/stores/useAppStore'

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderProfileEditScreen() {
  return render(
    <MemoryRouter initialEntries={['/profiles/default/edit']}>
      <Routes>
        <Route path="/profiles/:id/edit" element={<><ProfileEditScreen /><LocationDisplay /></>} />
        <Route path="/profiles" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

function resetStore() {
  localStorage.clear()
  useAppStore.setState({
    profiles: {
      default: {
        id: 'default',
        name: 'Default',
        isCharacter: false,
        skills: [],
        formulas: [],
        history: [],
        createdAt: 1,
        updatedAt: 1,
      },
    },
    activeProfileId: 'default',
    savedFormulas: [],
    rollHistory: [],
    settings: { theme: 'dark', highlightLowBattery: false },
    pairedPixelIds: [],
    pairedPixels: {},
    bleAvailable: true,
    bleError: null,
    pixels: {},
  })
}

describe('ProfileEditScreen', () => {
  beforeEach(() => {
    resetStore()
    vi.useRealTimers()
  })

  it('edits the profile name and character skills on a dedicated screen', () => {
    renderProfileEditScreen()

    fireEvent.change(screen.getByLabelText('Profile name'), {
      target: { value: 'Character A' },
    })

    expect(useAppStore.getState().profiles.default.name).toBe('Character A')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Is a Character' }))
    expect(useAppStore.getState().profiles.default.isCharacter).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '+ Add Skill' }))
    expect(screen.getByText('New Skill')).toBeInTheDocument()

    const skillCard = screen.getByText('New Skill').closest('article')!
    const labelButton = within(skillCard).getByRole('button', { name: 'New Skill' })
    fireEvent.click(labelButton)
    fireEvent.change(within(skillCard).getByDisplayValue('New Skill'), {
      target: { value: 'Cooking' },
    })

    expect(useAppStore.getState().profiles.default.skills.at(-1)).toMatchObject({
      label: 'Cooking',
      modifier: 0,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/profiles')
  })
})