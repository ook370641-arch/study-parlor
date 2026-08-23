import { useRef, useEffect } from 'react'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { useStore } from '@/store'
import { textColorPlugins } from '@/lib/milkdown-text-color'
import { pastePlainPlugins } from '@/lib/milkdown-paste-plain'
import { tabKeymapPlugins } from '@/lib/milkdown-tab-keymap'
import { codeblockEnterPlugins } from '@/lib/milkdown-codeblock-enter'
import { tableHandlesPlugins } from '@/lib/milkdown-table-handles'
import { gutterInsertPlugins } from '@/lib/milkdown-gutter-insert'
import { smartEnterPlugins } from '@/lib/milkdown-smart-enter'
import { hrBackspacePlugins } from '@/lib/milkdown-hr-backspace'
import { hrArrowDownPlugins } from '@/lib/milkdown-hr-arrow-down'
import { blockquoteUnwrapPlugins } from '@/lib/milkdown-blockquote-unwrap'
import { listBackspacePlugins } from '@/lib/milkdown-list-backspace'
import { milkdownClipboardPlugins } from '@/lib/milkdown-clipboard'
import { selectionBubblePlugins } from '@/lib/milkdown-selection-bubble'
import { orbitHrPlugins } from '@/lib/milkdown-orbit-hr'
import { linkOpenPlugins } from '@/lib/milkdown-link-open'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'
import { codeblockHighlightPlugins } from '@/lib/milkdown-codeblock-highlight'
import './writing-editor.css'

function EditorInner({ initial, onChange, registerAction = true, theme, filePath }: { initial: string; onChange: (md: string) => void; registerAction?: boolean; theme: 'academic' | 'newspaper'; filePath: string }) {
  const ref = useRef(onChange)
  ref.current = onChange

  const setAction = useStore(s => s.setWritingEditorAction)

  // Milkdown fires markdownUpdated when defaultValueCtx is applied during
  // editor creation.  If we let that through to onChange → updateWritingBody →
  // store set → initial ref changes → useEditor re-initializes → infinite loop
  // (React error #185).
  //
  // loadedRef gates the callback during initialization (sync gate, reset
  // every time initial changes — which triggers editor re-creation).  Once
  // useEditor's loading transitions to false, the editor is stable and we
  // open the gate so genuine user edits can flow through.
  const loadedRef = useRef(false)

  const { loading, get } = useEditor((root) => {
    return Editor.make()
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(milkdownClipboardPlugins)
      .use(textColorPlugins)
      .use(pastePlainPlugins)
      .use(tabKeymapPlugins)
      .use(codeblockEnterPlugins)
      .use(tableHandlesPlugins)
      .use(gutterInsertPlugins)
      .use(smartEnterPlugins)
      .use(hrBackspacePlugins)
      .use(hrArrowDownPlugins)
      .use(blockquoteUnwrapPlugins)
      .use(listBackspacePlugins)
      .use(selectionBubblePlugins)
      .use(orbitHrPlugins)
      .use(codeblockSchemaPlugins)
      .use(codeblockViewPlugins(filePath))
      .use(codeblockHighlightPlugins)
      .use(linkOpenPlugins)
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initial)
        ctx.get(listenerCtx).markdownUpdated((_, md) => { if (loadedRef.current) ref.current(md) })
      })
  }, [])

  // Register editor action proxy once the editor is created, so the toolbar
  // can call editor commands (bold, table, heading, etc.).
  // get() is a new function each render; stabilize via ref so the effect
  // only re-runs when loading actually changes, not on every re-render.
  const getRef = useRef(get)
  getRef.current = get

  useEffect(() => {
    if (!loading) {
      // onChange gate 对两种实例都必须打开（对照实例只跳过注册，不跳过 gate）
      loadedRef.current = true
      // 对照编辑器（registerAction=false）：不触碰全局 toolbar 单槽，注册与清理一并跳过
      if (registerAction === false) return
      // 实时取 getRef.current() 避免闭包捕获已销毁的旧 editor 实例
      // → toolbar 调用时拿到当前活跃 editor
      setAction((fn: any) => { getRef.current()?.action(fn) })
      return () => { setAction(null) }
    }
  }, [loading, setAction, registerAction])

  return (
    <div className="writing-editor-root" data-theme={theme}>
      <Milkdown />
    </div>
  )
}

export function WritingEditor(props: { initial: string; onChange: (md: string) => void; registerToolbarAction?: boolean; theme: 'academic' | 'newspaper'; filePath: string }) {
  return (
    <MilkdownProvider>
      <EditorInner initial={props.initial} onChange={props.onChange} registerAction={props.registerToolbarAction} theme={props.theme} filePath={props.filePath} />
    </MilkdownProvider>
  )
}
