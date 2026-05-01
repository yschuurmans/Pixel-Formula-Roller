import { PROFILE_DEFAULT_ID, PROFILE_DEFAULT_NAME, type Profile } from '../../stores/useAppStore'

export class ProfileScreenController {
  getProfiles(profiles: Record<string, Profile>, activeProfileId: string): Profile[] {
    return Object.values(profiles).sort((left, right) => {
      if (left.id === activeProfileId && right.id !== activeProfileId) {
        return -1
      }

      if (right.id === activeProfileId && left.id !== activeProfileId) {
        return 1
      }

      if (left.id === PROFILE_DEFAULT_ID && right.id !== PROFILE_DEFAULT_ID) {
        return -1
      }

      if (right.id === PROFILE_DEFAULT_ID && left.id !== PROFILE_DEFAULT_ID) {
        return 1
      }

      return left.name.localeCompare(right.name)
    })
  }

  getCreateError(name: string, profiles: Record<string, Profile>): string | null {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      return 'Please enter a profile name'
    }

    const normalized = trimmedName.toLowerCase()
    if (Object.values(profiles).some((profile) => profile.name.trim().toLowerCase() === normalized)) {
      return 'A profile with that name already exists'
    }

    return null
  }

  getRenameError(name: string, profileId: string, profiles: Record<string, Profile>): string | null {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      return 'Please enter a profile name'
    }

    const normalized = trimmedName.toLowerCase()
    if (
      Object.values(profiles).some(
        (profile) => profile.id !== profileId && profile.name.trim().toLowerCase() === normalized,
      )
    ) {
      return 'A profile with that name already exists'
    }

    return null
  }

  getDeleteDisabledReason(profileCount: number): string | null {
    return profileCount <= 1 ? 'At least one profile must remain' : null
  }

  getActiveProfileLabel(activeProfile: Profile | null): string {
    return activeProfile?.name ?? PROFILE_DEFAULT_NAME
  }
}