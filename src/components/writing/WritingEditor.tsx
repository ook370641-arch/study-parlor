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

  // Capture initial at editor‑create time so the markdownUpdated callback can
  // compare md against it.  Milkdown fires markdownUpdated when defaultValueCtx
  // is applied; if we let that through to onChange → updateWritingBody → store
  // set → initial ref changes → useEditor re‑initializes → infinite loop
  // (React error #185).  Skipping the emission when the markdown value equals
  // the captured initial value breaks the loop.
  const initRef = useRef(initial)
  initRef.current = initial

  const { loading, get } = useEditor((root) => {
    const capturedInit = initRef.current
    return Editor.make()
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(clipboard)
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, capturedInit)
        ctx.get(listenerCtx).markdownUpdated((_, md) => { if (md !== capturedInit) ref.current(md) })
      })
  }, [initial])

  // Register editor action proxy once the editor is created, so the toolbar
  // can call editor commands (bold, table, heading, etc.).
  useEffect(() => {
    if (!loading) {
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
