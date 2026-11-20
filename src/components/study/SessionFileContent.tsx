import { useCallback, useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { SVGRenderer } from '@/components/SVGRenderer'

type Props = { dirName: string; sessionNumber: number; fileName: string; title: string; version?: number }

export function SessionFileContent({ dirName, sessionNumber, fileName, title, version = 0 }: Props) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ loading: boolean; content: string | null; mimeType: string; error: string | null }>({
    loading: true, content: null, mimeType: 'text/markdown', error: null,
  })
  const retry = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    let cancelled = false
    setState(previous => ({ ...previous, loading: true, error: null }))
    ipc.readSessionFile({ dirName, sessionNumber, fileName })
      .then(result => {
        if (!cancelled) setState({ loading: false, content: result.content, mimeType: result.mimeType ?? 'text/markdown', error: null })
      })
      .catch(error => {
        if (!cancelled) setState(previous => ({ ...previous, loading: false, error: String(error?.message ?? error ?? '读取失败') }))
      })
    return () => { cancelled = true }
  }, [dirName, sessionNumber, fileName, attempt, version])

  if (state.loading) return <div data-testid="session-file-loading" className="p-8 text-center opacity-60">正在读取记忆…</div>
  if (state.error) return <div role="alert" className="p-8 text-center"><p>{state.error}</p><button type="button" data-testid="session-file-retry" onClick={retry} className="mt-3 text-ember underline">重试</button></div>
  if (!state.content) return <div data-testid="session-file-empty" className="p-8 text-center opacity-60">这份文件没有正文。</div>
  if (fileName.endsWith('.svg')) return <SVGRenderer source={state.content} />
  if (state.mimeType.startsWith('image/')) return <img src={`data:${state.mimeType};base64,${state.content}`} alt={title} />
  return <MarkdownRenderer content={state.content} fileName={fileName} />
}
