// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 外部粘贴清洗:网页/Word 粘贴的 HTML 带 style/class 与 h1-h6 层级,
// 经 schema parseDOM 后颜色(span[style*=color])和标题层级被保留,造成"五颜六色、大小不一"。
// 本插件在 transformPastedHTML 链上再插一环(prosemirror-view 用 someProp 串行调用所有
// transformPastedHTML,返回值 undefined 会继续遍历,天然链式):
//   - 含 data-pm-slice → 应用内部复制粘贴,原样返回(保留颜色/标题,不破坏往返)
//   - 否则 → DOMParser 解析后剥离 style/class,h1-h6 降级为 p,其余结构(列表/引用/表格/链接/图片)不动
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6'

/** 清洗外部粘贴 HTML:去 style/class,标题降级为段落。返回 body.innerHTML。 */
export function sanitizeExternalHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    el.removeAttribute('style')
    el.removeAttribute('class')
  }
  for (const h of Array.from(doc.body.querySelectorAll(HEADING_SELECTOR))) {
    const p = doc.createElement('p')
    while (h.firstChild) p.appendChild(h.firstChild)
    h.replaceWith(p)
  }
  return doc.body.innerHTML
}

const pastePlain = $prose(
  () =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_PASTE_PLAIN'),
      props: {
        transformPastedHTML: (html) => {
          // data-pm-slice 是 ProseMirror 内部复制的标记,原样放行
          if (html.includes('data-pm-slice')) return html
          return sanitizeExternalHTML(html)
        },
      },
    })
)

export const pastePlainPlugins: MilkdownPlugin[] = [pastePlain]
