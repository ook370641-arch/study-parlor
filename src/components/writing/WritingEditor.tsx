import { useRef, useEffect } from 'react'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { useStore } from '@/store'

function EditorInner({ initial, onChange }: { initial: string; onChange: (md: string) => void }) {
  const ref = useRef(onChange)
  ref.current = onChange

  const setAction = useStore(s => s.setWritingEditorAction)

  // Gate markdownUpdated during editor initialization — Milkdown fires
  // markdownUpdated when defaultValueCtx is applied, which would call
  // onChange → updateWritingBody → store set → initial ref changes →
  // useEditor re-initializes → infinite loop (React error #185).
  // loadedRef gates the first emission so only user edits trigger onChange.
  const loadedRef = useRef(false)

  const { loading, get } = useEditor((root) => {
    return Editor.make()
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(clipboard)
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initial)
        ctx.get(listenerCtx).markdownUpdated((_, md) => { if (loadedRef.current) ref.current(md) })
      })
  }, [initial])

  // Register editor action proxy once the editor is created, so the toolbar
  // (Task 8) can call editor commands. Also mark the editor as loaded so
  // subsequent user edits can trigger onChange.
  useEffect(() => {
    if (!loading) {
      loadedRef.current = true
      const editor = get()
      if (editor) {
        setAction((fn: any) => editor.action(fn))
      }
    }
    return () => { setAction(null) }
  }, [loading, get, setAction])

  return <Milkdown />
}

export function WritingEditor(props: { initial: string; onChange: (md: string) => void }) {
  return (
    <MilkdownProvider>
      <EditorInner {...props} />
    </MilkdownProvider>
  )
}
