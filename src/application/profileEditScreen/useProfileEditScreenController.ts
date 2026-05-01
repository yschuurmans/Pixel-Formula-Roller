import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../../stores/useAppStore'
import { ProfileEditScreenController } from './ProfileEditScreenController'

export function useProfileEditScreenController() {
  const controller = useMemo(() => new ProfileEditScreenController(), [])
  const navigate = useNavigate()
  const params = useParams<{ id: string }>()
  const profileId = params.id ?? null

  const profile = useAppStore((state) => (profileId ? state.profiles[profileId] ?? null : null))
  const setProfileCharacterMode = useAppStore((state) => state.setProfileCharacterMode)
  const addProfileSkill = useAppStore((state) => state.addProfileSkill)
  const updateProfileSkillLabel = useAppStore((state) => state.updateProfileSkillLabel)
  const updateProfileSkillModifier = useAppStore((state) => state.updateProfileSkillModifier)
  const removeProfileSkill = useAppStore((state) => state.removeProfileSkill)
  const reorderProfileSkills = useAppStore((state) => state.reorderProfileSkills)
  const renameProfile = useAppStore((state) => state.renameProfile)

  const handleClose = useCallback(() => {
    navigate('/profiles')
  }, [navigate])

  const handleSave = useCallback(() => {
    handleClose()
  }, [handleClose])

  const handleNameChange = useCallback((value: string) => {
    if (!profileId || !profile) {
      return
    }

    renameProfile(profileId, value)
  }, [profile, profileId, renameProfile])

  const handleToggleCharacterMode = useCallback((isCharacter: boolean) => {
    if (!profileId) return
    setProfileCharacterMode(profileId, isCharacter)
  }, [profileId, setProfileCharacterMode])

  const handleAddSkill = useCallback(() => {
    if (!profileId) return
    addProfileSkill(profileId)
  }, [addProfileSkill, profileId])

  const handleUpdateSkillLabel = useCallback((skillId: string, label: string) => {
    if (!profileId) return
    updateProfileSkillLabel(profileId, skillId, label)
  }, [profileId, updateProfileSkillLabel])

  const handleUpdateSkillModifier = useCallback((skillId: string, modifier: number) => {
    if (!profileId) return
    updateProfileSkillModifier(profileId, skillId, modifier)
  }, [profileId, updateProfileSkillModifier])

  const handleRemoveSkill = useCallback((skillId: string) => {
    if (!profileId) return
    removeProfileSkill(profileId, skillId)
  }, [profileId, removeProfileSkill])

  const handleReorderSkills = useCallback((activeSkillId: string, overSkillId: string) => {
    if (!profileId) return
    reorderProfileSkills(profileId, activeSkillId, overSkillId)
  }, [profileId, reorderProfileSkills])

  return {
    controller,
    profile,
    profileId,
    pageTitle: controller.getPageTitle(profile),
    notFoundMessage: controller.getNotFoundMessage(),
    handleClose,
    handleSave,
    handleNameChange,
    handleToggleCharacterMode,
    handleAddSkill,
    handleUpdateSkillLabel,
    handleUpdateSkillModifier,
    handleRemoveSkill,
    handleReorderSkills,
  }
}