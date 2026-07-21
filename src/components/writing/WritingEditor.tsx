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

  // Milkdown fires markdownUpdated when defaultValueCtx is applied during
  // editor creation.  If we let that through to onChange → updateWritingBody →
  // store set → initial ref changes → useEditor re-initializes → infinite loop
  // (React error #185).
  //
  // loadedRef gates the callback during initialization (sync gate, reset every
  // time initial changes — which triggers editor re-creation).  Once useEditor's
  // loading transitions to false, the editor is stable and we open the gate so
  // genuine user edits can flow through.
  const loadedRef = useRef(false)
  const prevInitial = useRef(initial)
  if (prevInitial.current !== initial) {
    prevInitial.current = initial
    loadedRef.current = false
  }

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
  // can call editor commands (bold, table, heading, etc.).
  // get() is a new function each render; stabilize via ref so the effect
  // only reruns when loading actually changes, not on every re-render.
  const getRef = useRef(get)
  getRef.current = get

  useEffect(() => {
    if (!loading) {
      loadedRef.current = true
      const editor = getRef.current()
      if (editor) {
        setAction((fn: any) => editor.action(fn))
      }
    }
    return () => { setAction(null) }
  }, [loading, setAction])

  return <Milkdown />
}

export function WritingEditor(props: { initial: string; onChange: (md: string) => void }) {
  return (
    <MilkdownProvider>
      <EditorInner {...props} />
    </MilkdownProvider>
  )
}
