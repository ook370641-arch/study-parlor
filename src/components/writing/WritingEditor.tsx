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
        ctx.get(listenerCtx).markdownUpdated((_, md) => ref.current(md))
      })
  }, [initial])

  // Register editor action proxy once the editor is created, so the toolbar
  // (Task 8) can call editor commands.
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
