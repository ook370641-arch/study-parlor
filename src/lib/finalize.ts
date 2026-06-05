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

  // 预计算 pending archive 的 key，用于成功或失败时统一清理
  const pendingDirName = sess.dirName ?? sess.topic.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '-').replace(/-+/g, '-')
  const pendingTopicMeta = s.library.find(t => t.dirName === sess.dirName)
  const pendingSessionNumber = sess.dirName && pendingTopicMeta ? pendingTopicMeta.sessionCount + 1 : 1

  try {
    if (sess.mode === 'progress') {
      const { title: llmTitle, description, body, progress_summary } = await ipc.llmFinalizeProgress(historySnapshot)
      // 新主题优先使用用户输入的 topic 作为 title，LLM 提取的作为 fallback
      const title = sess.topic || llmTitle

      // 确定 session 编号
      const topicMeta = s.library.find(t => t.dirName === sess.dirName)
      const sessionNumber = sess.dirName && topicMeta
        ? topicMeta.sessionCount + 1
        : 1
      const dirName = sess.dirName ?? title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '-').replace(/-+/g, '-')

      // 写学习报告
      await ipc.writeProgressMd({
        title, description, body, difficulty: sess.difficulty,
        dirName, session_number: sessionNumber, progress_summary
      })

      // 生成并写寓言
      try {
        const fable = await ipc.llmGenerateFable({ history: historySnapshot, topic: title })
        await ipc.writeFable({
          dirName, sessionNumber,
          title: fable.title, body: fable.body
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

      // 异步生成图表（不 await，不阻塞归档）
      try {
        ipc.llmGenerateDiagram({
          dirName,
          sessionNumber,
          reportBody: body
        }).catch((e) => {
          console.warn('[finalize] diagram generation failed:', e)
        })
      } catch (e) {
        console.warn('[finalize] diagram generation init failed:', e)
      }

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
      // 与 kickoff 对齐:复习取最新 session 的学习报告
      const { frontmatter, body: existingBody } = await ipc.readAnchorFile(sess.dirName)
      // 把 frontmatter 中的关键上下文拼进笔记正文，让 LLM 复习归档时看到完整图景
      const enrichedBody = [
        frontmatter.description ? `主题描述: ${frontmatter.description}` : '',
        frontmatter.progress_summary ? `上次学习进度: ${frontmatter.progress_summary}` : '',
        frontmatter.tags?.length ? `标签: ${frontmatter.tags.join(', ')}` : '',
        frontmatter.difficulty ? `难度: ${frontmatter.difficulty}` : '',
        '---\n笔记正文:\n' + existingBody
      ].filter(Boolean).join('\n\n')
      const { summary, gaps, mastery_assessment, mastery_checklist, future_advice } = await ipc.llmFinalizeReview({ history: historySnapshot, existingBody: enrichedBody })

      const topicMeta = s.library.find(t => t.dirName === sess.dirName)
      const lastReviewedSession = [...(topicMeta?.sessions ?? [])].reverse().find(sm => sm.hasReview)
      const reviewIndex = (lastReviewedSession?.sessionNumber ?? 0) + 1
      await ipc.writeReviewReport({
        topic: sess.topic,
        dirName: sess.dirName ?? sess.topic,
        summary, gaps,
        review_index: reviewIndex,
        mastery_checklist,
        future_advice
      })

      s.showToast(`《${sess.topic}》复习报告已归档`)

      const lib = await ipc.scanLibrary()
      // Build review report content for modal display
      const masteryBadge = mastery_assessment
        ? `掌握度：${mastery_assessment === 'high' ? '扎实' : mastery_assessment === 'mid' ? '中等' : '需补强'}`
        : ''
      const gapsText = gaps.length > 0
        ? gaps.map((g, i) => `${i + 1}. ${g.trim()}`).join('\n')
        : '（本次复习未发现明显知识缺口）'
      const checklistText = mastery_checklist && mastery_checklist.length > 0
        ? mastery_checklist.map(c => {
            const trimmed = c.trim()
            if (trimmed.startsWith('已掌握')) return `- [x] ${trimmed.replace(/^已掌握[：:]\s*/, '')}`
            if (trimmed.startsWith('未掌握')) return `- [ ] ${trimmed.replace(/^未掌握[：:]\s*/, '')}`
            return `- [ ] ${trimmed}`
          }).join('\n')
        : ''
      const adviceText = future_advice && future_advice.length > 0
        ? future_advice.map((a, i) => `${i + 1}. ${a.trim()}`).join('\n')
        : ''
      const content = [
        masteryBadge,
        '## 复习摘要',
        '',
        summary.trim(),
        gaps.length > 0 ? '\n## 知识缺口\n\n' + gapsText : '',
        checklistText ? '\n## 掌握检验\n\n' + checklistText : '',
        adviceText ? '\n## 未来发展建议\n\n' + adviceText : ''
      ].filter(Boolean).join('\n')

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

    // 归档成功：清理占位和未保存会话
    s.removePendingArchive(pendingDirName, pendingSessionNumber)
    const unsaved = s.unsavedSessions.find(us => us.topic === sess.topic)
    if (unsaved) s.removeUnsavedSession(unsaved.id)
  } catch (err: any) {
    // 归档失败：清理占位，避免残留
    s.removePendingArchive(pendingDirName, pendingSessionNumber)
    s.showToast('归档失败:' + (err?.message ?? err))
    throw err
  }
}
