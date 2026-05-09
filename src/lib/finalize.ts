import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

export async function finalizeAndReturnHome() {
  const s = useStore.getState()
  const sess = s.session
  if (!sess) return

  // 若仍在 streaming,先 abort
  if (sess.streaming) await ipc.llmAbort(sess.abortId)

  try {
    if (sess.mode === 'progress') {
      const { title, body, progress_summary } = await ipc.llmFinalizeProgress(sess.history)
      await ipc.writeProgressMd({
        title, body, difficulty: sess.difficulty,
        session_number: s.session_count,
        progress_summary
      })
      s.showToast(`《${title}》已归档`)

      // 清理未保存会话
      const unsaved = s.unsavedSessions.find(us => us.topic === sess.topic)
      if (unsaved) s.removeUnsavedSession(unsaved.id)

      const lib = await ipc.scanLibrary()
      useStore.setState({ library: lib })
    } else if (sess.mode === 'review') {
      if (!sess.file_path) throw new Error('review session has no file_path')
      const { body: existingBody } = await ipc.readMd(sess.file_path)
      const { summary, gaps } = await ipc.llmFinalizeReview({ history: sess.history, existingBody })

      // 写独立复习报告到 复习/ 目录
      const topicMeta = s.library.find(t => t.dirName === sess.dirName)
      const reviewIndex = (topicMeta?.review_count ?? 0) + 1
      await ipc.writeReviewReport({
        topic: sess.topic,
        dirName: sess.dirName ?? sess.topic,
        summary,
        gaps,
        review_index: reviewIndex
      })

      s.showToast(`《${sess.topic}》复习报告已归档`)

      const lib = await ipc.scanLibrary()
      useStore.setState({ library: lib })
    }
  } catch (err: any) {
    // 兜底:recovery dump
    const dump = JSON.stringify({
      mode: sess.mode,
      topic: sess.topic,
      file_path: sess.file_path,
      dirName: sess.dirName,
      history: sess.history,
      error: String(err?.message ?? err)
    }, null, 2)
    await ipc.recoveryDump({
      filename: `${sess.mode}-${sess.topic.replace(/[^\w一-龥]/g, '_')}.json`,
      content: dump
    })
    s.showToast('归档失败,已写入 recovery 目录')
    throw err
  }

  s.resetSession()
}
