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

  // 清除 archivePending，避免 finalize 过程中 banner 闪烁
  useStore.setState(state => state.session
    ? { session: { ...state.session, archivePending: false } }
    : state)

  try {
    if (sess.mode === 'progress') {
      const { title: llmTitle, body, progress_summary } = await ipc.llmFinalizeProgress(historySnapshot)
      // 新主题优先使用用户输入的 topic 作为 title，LLM 提取的作为 fallback
      const title = sess.topic || llmTitle

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

      const lib = await ipc.scanLibrary()
      useStore.setState({
        library: lib,
        archiveResult: {
          mode: 'progress',
          topic: sess.topic,
          title,
          content: body
        }
      })
    } else if (sess.mode === 'review') {
      if (!sess.dirName) throw new Error('review session has no dirName')
      // 与 kickoff 对齐:复习取最新 session 的学习报告作为 existingBody
      const { body: existingBody } = await ipc.readAnchorFile(sess.dirName)
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
      // Build review report content from summary + gaps
      const gapsText = gaps.length > 0
        ? gaps.map((g, i) => `${i + 1}. ${g.trim()}`).join('\n')
        : '（本次复习未发现明显知识缺口）'
      const content = `## 复习摘要\n\n${summary.trim()}\n\n## 知识缺口\n\n${gapsText}`

      useStore.setState({
        library: lib,
        archiveResult: {
          mode: 'review',
          topic: sess.topic,
          title: sess.topic,
          content
        }
      })
    }

    // 归档成功：清理该 topic 的未保存会话
    const unsaved = s.unsavedSessions.find(us => us.topic === sess.topic)
    if (unsaved) s.removeUnsavedSession(unsaved.id)
  } catch (err: any) {
    s.showToast('归档失败:' + (err?.message ?? err))
    throw err
  }
}
