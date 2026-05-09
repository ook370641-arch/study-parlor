import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

export async function finalizeAndReturnHome() {
  const s = useStore.getState()
  const sess = s.session
  if (!sess) return

  // 若仍在 streaming,先 abort
  if (sess.streaming) await ipc.llmAbort(sess.abortId)

  // snapshot history 防止 finalize 过程中被 SSE 流修改
  const historySnapshot = [...sess.history]

  try {
    if (sess.mode === 'progress') {
      const { title, body, progress_summary } = await ipc.llmFinalizeProgress(historySnapshot)

      // 确定 session 编号
      const topicMeta = s.library.find(t => t.dirName === sess.dirName)
      const sessionNumber = sess.dirName && topicMeta
        ? topicMeta.sessionCount + 1
        : 1
      const dirName = sess.dirName ?? title.toLowerCase().replace(/[^\w一-龥]/g, '-').replace(/-+/g, '-')

      // 写学习报告
      await ipc.writeProgressMd({
        title, body, difficulty: sess.difficulty,
        dirName, session_number: sessionNumber, progress_summary
      })

      // 生成并写寓言
      try {
        const fable = await ipc.llmGenerateFable({ history: historySnapshot, topic: title })
        await ipc.writeTranscript({
          dirName, sessionNumber,
          content: `# ${fable.title}\n\n${fable.body}`
        })
      } catch (e) {
        console.warn('[finalize] fable generation failed:', e)
      }

      // 写原始对话
      const transcriptContent = historySnapshot.map((m, i) => {
        const time = new Date(Date.now() - (sess.history.length - i) * 60000).toISOString()
        return `## ${time}\n**${m.role === 'user' ? '用户' : 'AI'}**：${m.content}\n\n---`
      }).join('\n')
      await ipc.writeTranscript({
        dirName, sessionNumber,
        content: `# 原始对话\n\n${transcriptContent}`
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
      const { summary, gaps } = await ipc.llmFinalizeReview({ history: historySnapshot, existingBody })

      const topicMeta = s.library.find(t => t.dirName === sess.dirName)
      const reviewIndex = (topicMeta?.sessions.find(sm => sm.hasReview)?.sessionNumber ?? 0) + 1
      await ipc.writeReviewReport({
        topic: sess.topic,
        dirName: sess.dirName ?? sess.topic,
        summary, gaps,
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
      history: historySnapshot,
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
