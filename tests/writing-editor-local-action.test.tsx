// @vitest-environment jsdom
// registerLocalAction 的 useState 函数陷阱回归 —— 2026-10-02 页面崩溃
// 「action is not a function」:宿主若把 useState setter 直接当 registerLocalAction,
// React 会把 action 当 updater 用 prevState(=null) 调用 → milkdown .action(null) 抛错。
// 修复:宿主必须包一层 setHrAction(() => a)。
// 注意:不在 jsdom 渲染完整 WritingEditor 组件(编辑器创建链路在 jsdom 不完整,
// loading 永不翻 false);用裸 editor + listener 模拟对照宿主的接线方式。
import { describe, it, expect, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React, { useCallback, useState } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { history } from '@milkdown/plugin-history'
import { orbitHrPlugins } from '@/lib/milkdown-orbit-hr'
import { insertHrBelow } from '@/lib/milkdown-insert-hr'

afterEach(() => cleanup())

describe('registerLocalAction 通道', () => {
  it('包装模式(setHrAction(() => a)):action 存为值,按钮可插入分隔线', async () => {
    const rootEl = document.createElement('div')
    document.body.appendChild(rootEl)
    const editor = await Editor.make()
      .use(commonmark).use(gfm).use(history).use(orbitHrPlugins)
      .config(ctx => {
        ctx.set(rootCtx, rootEl)
        ctx.set(defaultValueCtx, '第一段。')
      })
      .create()

    // 模拟 WritingEditor 的 action 通道 + 对照宿主的包装注册
    const editorAction = (fn: (ctx: any) => void) => { editor.action(fn) }
    function Harness() {
      const [hrAction, setHrAction] = useState<((fn: (ctx: any) => void) => void) | null>(null)
      // 正确姿势:函数值必须包 () => a,否则 React 当 updater 用 prevState 调用
      const registerHrAction = useCallback((a: ((fn: (ctx: any) => void) => void) | null) => {
        setHrAction(() => a)
      }, [])
      return (
        <>
          <button data-testid="register" onClick={() => registerHrAction(editorAction)} />
          <button
            data-testid="insert-hr"
            onClick={() => hrAction?.((ctx: any) => { insertHrBelow(ctx) })}
          />
        </>
      )
    }
    const { getByTestId } = render(<Harness />)
    act(() => { getByTestId('register').click() })
    act(() => { getByTestId('insert-hr').click() })
    // 直接断言文档含 hr 节点(listener 的 markdownUpdated 在 jsdom 异步,不可靠)
    const doc = editor.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
    const hasHr = JSON.stringify(doc).includes('"type":"hr"')
    expect(hasHr).toBe(true)
    editor.destroy()
  })

  it('裸 setter 模式(反例):React 把函数当 updater 用 prevState 调用,而非存为值', () => {
    // 锁定 React 语义(崩溃机理):setState(fn) 中 fn 会被当 updater 调用。
    // 真实场景:prevState=null → action(null) → milkdown .action(null) 抛
    // 「action is not a function」(2026-10-02 页面崩溃堆栈与此一致)。
    function Harness() {
      const [val, setVal] = useState<unknown>('prev-state')
      return (
        <button
          data-testid="go"
          onClick={() => {
            const action = (fn: unknown) => `updater-called-with:${String(fn)}`
            setVal(action as never) // 裸传函数 → React 当 updater:val = action(prev)
          }}
        >
          {String(val)}
        </button>
      )
    }
    const { getByTestId } = render(<Harness />)
    act(() => { getByTestId('go').click() })
    expect(getByTestId('go').textContent).toBe('updater-called-with:prev-state')
  })
})
