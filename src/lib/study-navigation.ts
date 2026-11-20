import { useStore } from '@/store'

async function saveStudySnapshot(): Promise<boolean> {
  const state = useStore.getState()
  try {
    await state.saveCurrentSession()
    return true
  } catch (error) {
    state.showToast(`保存会话失败：${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

export async function withStudySaved(navigate: () => void | Promise<void>): Promise<boolean> {
  const state = useStore.getState()
  if (state.currentPage === 'study' && !(await saveStudySnapshot())) return false
  await navigate()
  return true
}

export async function withSessionReplaced(replace: () => void | Promise<void>): Promise<boolean> {
  if (!(await saveStudySnapshot())) return false
  await replace()
  return true
}

export async function openStudyTopicFromTree(dirName: string, sessionNumber?: number): Promise<boolean> {
  return withStudySaved(async () => {
    const state = useStore.getState()
    state.openStudyTopic(dirName, sessionNumber)
    await state.setBriefingSource('study')
    if (useStore.getState().currentPage !== 'briefing') await useStore.getState().goto('briefing')
  })
}
