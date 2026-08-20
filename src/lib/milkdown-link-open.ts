// 链接点击打开(2026-08-18 用户反馈:hermes 日报 file:// 链接无法显示/点击)。
//
// 背景:Milkdown commonmark 的 sanitizeLinkHref 白名单(http/https/mailto/tel/ftp)
// 会把 file:// 清洗成渲染层的 href="",但 mark.attrs.href 里的原始 URL 完好。
// 所以点击时从文档 mark 取原始 href 路由:http(s) 走浏览器,file:// 用系统默认程序打开。
// 链接可见性由 writing-editor.css 的 `.ProseMirror a` 规则负责(选择器不能带 [href])。
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { Node as PMNode } from '@milkdown/prose/model'
import type { MilkdownPlugin } from '@milkdown/ctx'
import { ipc } from './ipc'

export type LinkOpenTarget = { kind: 'external' | 'local'; url: string }

/** 按协议路由链接:http(s) → 浏览器;file → 系统默认程序;其余不处理。 */
export function resolveLinkOpen(href: unknown): LinkOpenTarget | null {
  if (typeof href !== 'string' || !href.trim()) return null
  const url = href.trim()
  if (/^https?:\/\//i.test(url)) return { kind: 'external', url }
  if (/^file:\/\//i.test(url)) return { kind: 'local', url }
  return null
}

/** 取 pos 处文本节点上 link mark 的原始 href(未经 sanitizeLinkHref 清洗)。 */
export function findLinkHrefAt(doc: PMNode, pos: number): string | null {
  const markAt = (p: number) => doc.nodeAt(p)?.marks.find(m => m.type.name === 'link')
  const mark = markAt(pos) ?? (pos > 0 ? markAt(pos - 1) : undefined)
  const href = mark?.attrs.href
  return typeof href === 'string' && href ? href : null
}

const linkOpen = $prose(() => new Plugin({
  key: new PluginKey('writing-link-open'),
  props: {
    handleClick(view, pos, event) {
      // 只在点击直接落在 <a> 上时打开;光标定位到链接旁(pos 邻近 mark)不触发,
      // 否则用户无法把光标放到链接后按删除键(2026-08-19 反馈)。
      const el = event.target
      if (!(el instanceof Element) || !el.closest('a')) return false
      const target = resolveLinkOpen(findLinkHrefAt(view.state.doc, pos))
      if (!target) return false
      const pending = target.kind === 'external'
        ? ipc.openExternal(target.url)
        : ipc.openLocalFile(target.url)
      pending.catch(err => console.error('[link-open]', target.url, err))
      return true
    },
  },
}))

export const linkOpenPlugins: MilkdownPlugin[] = [linkOpen]
