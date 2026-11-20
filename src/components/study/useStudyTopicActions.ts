import { useState } from 'react'
import type { TopicMeta } from '@shared/index'
import { useStore } from '@/store'

export function useStudyTopicActions(topic: TopicMeta) {
  const openPreStudy = useStore(state => state.openPreStudy)
  const renameTopic = useStore(state => state.renameTopic)
  const archiveTopic = useStore(state => state.archiveTopic)
  const dismissPendingReport = useStore(state => state.dismissPendingReport)
  const showToast = useStore(state => state.showToast)
  const pendingReport = useStore(state => state.pendingReports[topic.dirName] ?? topic.pendingReport)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [reportOpen, setReportOpen] = useState(false)

  const continueStudy = () => openPreStudy({ mode: 'progress', topic: topic.title, dirName: topic.dirName })
  const reviewTopic = () => openPreStudy({ mode: 'review', topic: topic.title, dirName: topic.dirName })
  const startRename = () => { setRenameValue(topic.title); setRenaming(true) }
  const cancelRename = () => setRenaming(false)
  const submitRename = async () => {
    const nextName = renameValue.trim()
    setRenaming(false)
    if (!nextName || nextName === topic.title) return
    try {
      await renameTopic(topic.dirName, nextName)
      showToast(`已更名为「${nextName}」`)
    } catch (error) {
      showToast(`重命名失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const archive = async () => {
    try {
      await archiveTopic(topic.dirName)
      showToast(`「${topic.title}」已归档，可在设置中恢复`)
    } catch (error) {
      showToast(`归档失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const closePendingReport = () => { dismissPendingReport(topic.dirName); setReportOpen(false) }

  return {
    continueStudy, reviewTopic, renaming, renameValue, setRenameValue,
    startRename, cancelRename, submitRename, archive, pendingReport, reportOpen,
    openPendingReport: () => setReportOpen(true), closePendingReport,
  }
}
