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
  const renameProfile = useAppStore((state) => state.renameProfile)
  const deleteProfile = useAppStore((state) => state.deleteProfile)
  const selectProfile = useAppStore((state) => state.selectProfile)

  const activeProfile = useAppStore((state) => getActiveProfileState(state))
  const profileList = useMemo(
    () => controller.getProfiles(profiles, activeProfileId),
    [activeProfileId, controller, profiles],
  )

  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileError, setNewProfileError] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [editingProfileName, setEditingProfileName] = useState('')
  const [editingProfileError, setEditingProfileError] = useState<string | null>(null)
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

  const handleBeginRename = useCallback((profile: Profile) => {
    setEditingProfile(profile)
    setEditingProfileName(profile.name)
    setEditingProfileError(null)
  }, [])

  const handleCancelRename = useCallback(() => {
    setEditingProfile(null)
    setEditingProfileName('')
    setEditingProfileError(null)
  }, [])

  const handleSaveRename = useCallback(() => {
    if (!editingProfile) {
      return
    }

    const error = controller.getRenameError(editingProfileName, editingProfile.id, profiles)
    if (error) {
      setEditingProfileError(error)
      return
    }

    const renamed = renameProfile(editingProfile.id, editingProfileName)
    if (!renamed) {
      setEditingProfileError('Unable to rename profile')
      return
    }

    handleCancelRename()
  }, [controller, editingProfile, editingProfileName, handleCancelRename, profiles, renameProfile])

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
    editingProfile,
    editingProfileError,
    editingProfileName,
    isDeleteDisabled,
    navigateHome,
    newProfileError,
    newProfileName,
    profileList,
    setEditingProfileName,
    setNewProfileName,
    handleBeginRename,
    handleCancelDelete,
    handleCancelRename,
    handleConfirmDelete,
    handleCreateProfile,
    handleRequestDelete,
    handleSaveRename,
    handleSelectProfile,
  }
}