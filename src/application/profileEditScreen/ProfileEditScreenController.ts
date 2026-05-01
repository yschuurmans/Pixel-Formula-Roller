import type { Profile } from '../../stores/useAppStore'

export class ProfileEditScreenController {
  getNotFoundMessage(): string {
    return 'Profile not found'
  }

  getPageTitle(profile: Profile | null): string {
    return profile ? `Edit ${profile.name}` : 'Edit profile'
  }
}