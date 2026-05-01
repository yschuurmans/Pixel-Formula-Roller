import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveProfileState, type Profile, useAppStore } from '../../stores/useAppStore'
import { ProfileScreenController } from './ProfileScreenController'

export function useProfileScreenController() {
  const controller = useMemo(() => new ProfileScreenController(), [])
  const navigate = useNavigate()
  const profiles = useAppStore((state) => state.profiles)
  const activeProfileId = useAppStore((state) => state.activeProfileId)
  const createProfile = useAppStore((state) => state.createProfile)
  const deleteProfile = useAppStore((state) => state.deleteProfile)
  const selectProfile = useAppStore((state) => state.selectProfile)

  const activeProfile = useAppStore((state) => getActiveProfileState(state))
  const profileList = useMemo(
    () => controller.getProfiles(profiles, activeProfileId),
    [activeProfileId, controller, profiles],
  )

  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileError, setNewProfileError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)

  const handleCreateProfile = useCallback(() => {
    const error = controller.getCreateError(newProfileName, profiles)
    if (error) {
      setNewProfileError(error)
      return
    }

    const createdProfileId = createProfile(newProfileName)
    if (!createdProfileId) {
      setNewProfileError('Unable to create profile')
      return
    }

    setNewProfileName('')
    setNewProfileError(null)
  }, [controller, createProfile, newProfileName, profiles])

  const handleSelectProfile = useCallback(
    (profileId: string) => {
      selectProfile(profileId)
    },
    [selectProfile],
  )

  const handleOpenProfileEditor = useCallback((profileId: string) => {
    navigate(`/profiles/${profileId}/edit`)
  }, [navigate])

  const handleRequestDelete = useCallback((profile: Profile) => {
    setDeleteTarget(profile)
  }, [])

  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) {
      return
    }

    deleteProfile(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteProfile, deleteTarget])

  const navigateHome = useCallback(() => {
    navigate('/')
  }, [navigate])

  const isDeleteDisabled = useMemo(
    () => controller.getDeleteDisabledReason(profileList.length) !== null,
    [controller, profileList.length],
  )

  return {
    activeProfile,
    activeProfileLabel: controller.getActiveProfileLabel(activeProfile),
    deleteTarget,
    isDeleteDisabled,
    navigateHome,
    newProfileError,
    newProfileName,
    profileList,
    setNewProfileName,
    handleCancelDelete,
    handleConfirmDelete,
    handleCreateProfile,
    handleOpenProfileEditor,
    handleRequestDelete,
    handleSelectProfile,
  }
}