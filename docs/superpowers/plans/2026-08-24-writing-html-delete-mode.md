# HTML 删除模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写作库 HTML 预览支持「删除模式」：hover 高亮块、点击删除、Ctrl+Z 撤销、退出自动写回（按天备份）。

**Architecture:** 删除交互全部在 iframe 内完成——`buildPreviewSrcdoc` 装配期注入常驻休眠的删除脚本（与 base/zoom 同链），父进程 postMessage 激活；保存时 iframe 克隆 DOM、剔除所有 `[data-sp-inject]` 注入物后序列化回传，父进程走新增 `writing:saveHtml` IPC 原文写回。沙箱保持 opaque origin（不加 allow-same-origin）。

**Tech Stack:** Electron 30 ipcMain/contextBridge、React 18 + Zustand、Vitest、Playwright（frameLocator 穿透沙箱）。

**Spec:** `docs/superpowers/specs/2026-08-24-writing-html-delete-mode-design.md`

## Global Constraints

- 测试只跑受影响文件（general §9）：禁止 `npx vitest run` 全量、禁止全量 E2E。
- E2E 跑 `out/` 构建产物；手动 playwright 前必须 `npx electron-vite build`（e2e §11）；本地用 `node scripts/e2e-changed.js --run --no-retries`。
- 新 IPC 按 types → handler → preload → facade 四层同步（ipc-state §1），E2E 里加 `window.api.writingSaveHtml` 暴露断言。
- 错误码复用现有 `WritingErrorCode`（`WRITING_PATH_FORBIDDEN` / `WRITING_IO_ERROR`），不新增。
- 注入脚本（`html-delete-script.ts`）约束：**不得包含字面量 `</script`**（提前闭合标签）、**不得包含反引号或 `${`**；postMessage 目标 origin 一律 `'*'`（opaque origin）。
- 组件文件只导出组件（ui-styling §10）。
- 不得给 iframe sandbox 加 `allow-same-origin`。

---

### Task 1: srcdoc 注入链 + 主进程写回链（四层 IPC）

**Files:**
- Create: `src/lib/html-delete-script.ts`
- Modify: `src/lib/html-srcdoc.ts`（全文重写，30 行 → 50 行）
- Modify: `src/types/index.ts:829`（`writingOpenInSystem` 行后加一行）
- Modify: `electron/lib/writing-tree.ts:322`（`writeWritingFile` 后加 `writeHtmlFile`）
- Modify: `electron/ipc/writing.ts:170`（`writing:openInSystem` handler 后加 handler）
- Modify: `electron/preload.ts:187`（`writingOpenInSystem` 行后加一行）
- Modify: `src/lib/ipc.ts:125`（`writingOpenInSystem` getter 后加一行）
- Test: `tests/html-srcdoc.test.ts`、`tests/writing-backup.test.ts`

**Interfaces:**
- Consumes: 现有 `buildPreviewSrcdoc(html, zoom)`、`assertInsideRoots(lib, rel)`、`maybeBackupDaily(lib, rel, existingRaw)`（writing-tree.ts 模块内）、`wrapWriting`（ipc/writing.ts 模块内）。
- Produces（Task 2/3 依赖）:
  - `buildPreviewSrcdoc(html: string, zoom: number): string` — 输出额外含 `<style data-sp-inject>.sp-del-hover…</style>` 与 `<script data-sp-inject>…</script>`（`</body>` 前，无 body 尾置）
  - postMessage 协议：父→iframe `{type:'sp-html-edit',on:boolean}` `{type:'sp-html-collect'}`；iframe→父 `{type:'sp-html-dirty'}` `{type:'sp-html-save',html:string}`
  - `window.api.writingSaveHtml(a: { path: string; html: string }): Promise<WritingResult<null>>`

- [ ] **Step 1: 写失败测试 — html-srcdoc 注入**

先改 `tests/html-srcdoc.test.ts` 两条既有断言（注入物新增 `data-sp-inject` 标记）：

```ts
// 原: expect(out).toContain('<head><base target="_blank">')
expect(out).toContain('<head><base target="_blank" data-sp-inject">')

// 原: expect(out.startsWith('<base target="_blank">')).toBe(true)
expect(out.startsWith('<base target="_blank" data-sp-inject>')).toBe(true)

// 原: expect(out).toContain('<style>html{zoom:1.33 !important}</style></head>')
expect(out).toContain('<style data-sp-inject>html{zoom:1.33 !important}</style></head>')

// 原: expect(out).toContain('<style>html{zoom:1.33 !important}</style>')
expect(out).toContain('<style data-sp-inject>html{zoom:1.33 !important}</style>')
```

文件末尾追加 describe：

```ts
describe('删除模式脚本注入', () => {
  it('hover 样式与编辑脚本带 data-sp-inject，插到 </body> 前', () => {
    const out = buildPreviewSrcdoc('<html><head></head><body><p>x</p></body></html>', 1.2)
    expect(out).toContain('<style data-sp-inject>.sp-del-hover')
    const scriptIdx = out.indexOf('<script data-sp-inject>')
    expect(scriptIdx).toBeGreaterThan(-1)
    expect(out.indexOf('</body>')).toBeGreaterThan(scriptIdx)
  })

  it('无 </body> 时尾置', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.2)
    expect(out.trimEnd().endsWith('</script>')).toBe(true)
  })

  it('脚本体不含字面量 </script（会提前闭合标签）', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.2)
    const m = out.match(/<script data-sp-inject>([\s\S]*?)<\/script>/)
    expect(m).not.toBeNull()
    expect(m![1]).not.toContain('</script')
    expect(m![1]).not.toContain('`')
  })

  it('脚本含 postMessage 协议四件套与块选择器', () => {
    const out = buildPreviewSrcdoc('<p>hi</p>', 1.2)
    for (const token of ['sp-html-edit', 'sp-html-collect', 'sp-html-save', 'sp-html-dirty', 'data-sp-inject']) {
      expect(out).toContain(token)
    }
  })
})
```

- [ ] **Step 2: 写失败测试 — writeHtmlFile**

`tests/writing-backup.test.ts` 第 7 行 import 加 `writeHtmlFile`，文件末尾追加：

```ts
describe('writeHtmlFile：HTML 原文写回（删除模式）', () => {
  const HTML_V1 = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>旧段落</p></body></html>'
  const HTML_V2 = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>'

  it('原文写回，不经 gray-matter（内容逐字节相等）', () => {
    writeArticle('writing/报告.html', HTML_V1)
    writeHtmlFile(lib, 'writing/报告.html', HTML_V2)
    expect(fs.readFileSync(path.join(lib, 'writing/报告.html'), 'utf-8')).toBe(HTML_V2)
  })

  it('写回前生成当日按天备份，内容 = 修改前版本', () => {
    writeArticle('writing/报告.html', HTML_V1)
    writeHtmlFile(lib, 'writing/报告.html', HTML_V2)
    expect(readBackup('writing/报告.html')).toBe(HTML_V1)
  })

  it('repository/ 根下写回不产生备份', () => {
    writeArticle('repository/报告.html', HTML_V1)
    writeHtmlFile(lib, 'repository/报告.html', HTML_V2)
    expect(fs.existsSync(path.join(lib, 'writing/.backups'))).toBe(false)
    expect(fs.readFileSync(path.join(lib, 'repository/报告.html'), 'utf-8')).toBe(HTML_V2)
  })

  it('拒绝非 .html 扩展名（WRITING_PATH_FORBIDDEN）', () => {
    writeArticle('writing/a.md', 'x')
    expect(() => writeHtmlFile(lib, 'writing/a.md', HTML_V2)).toThrowError(/仅支持写回/)
  })

  it('拒绝根外路径', () => {
    expect(() => writeHtmlFile(lib, '../outside.html', HTML_V2)).toThrow()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/html-srcdoc.test.ts tests/writing-backup.test.ts`
Expected: FAIL — `buildPreviewSrcdoc` 输出无 `data-sp-inject`/脚本；`writeHtmlFile is not a function`

- [ ] **Step 4: 实现注入脚本常量**

Create `src/lib/html-delete-script.ts`：

```ts
/**
 * 注入到 HTML 预览 iframe 的删除模式脚本与 hover 样式（srcdoc 装配期注入，常驻休眠，
 * 父进程 postMessage {type:'sp-html-edit',on} 激活）。
 * 约束：脚本体不得包含字面量 "</script"（提前闭合标签）、不得包含反引号/${；
 * postMessage 目标 origin 用 '*'（沙箱 opaque origin）。
 */

export const HTML_DELETE_HOVER_STYLE =
  '.sp-del-hover{outline:2px solid #d97757 !important;outline-offset:-2px !important;cursor:pointer !important}'

export const HTML_DELETE_SCRIPT = [
  '(function(){',
  'var HOVER="sp-del-hover";',
  'var SEL="p,li,blockquote,pre,tr,table,h1,h2,h3,h4,h5,h6,figure,section,article";',
  'var active=false,dirty=false,hovered=null,undoStack=[];',
  'function blockOf(e){var t=e.target;if(!t||!t.closest)return null;',
  'var b=t.closest(SEL);',
  'if(!b||b===document.documentElement||b===document.body)return null;return b;}',
  'function setHover(el){if(hovered===el)return;',
  'if(hovered)hovered.classList.remove(HOVER);',
  'hovered=el;if(hovered)hovered.classList.add(HOVER);}',
  'document.addEventListener("mouseover",function(e){if(active)setHover(blockOf(e));},true);',
  // 删除模式下拦下一切点击（含链接）并删块；capture 阶段先于页面脚本
  'document.addEventListener("click",function(e){',
  'if(!active)return;',
  'e.preventDefault();e.stopPropagation();',
  'var b=blockOf(e);if(!b)return;',
  'undoStack.push({el:b,parent:b.parentNode,next:b.nextSibling});',
  'setHover(null);b.remove();',
  'if(!dirty){dirty=true;window.parent.postMessage({type:"sp-html-dirty"},"*");}',
  '},true);',
  // Ctrl+Z 撤销：活 DOM 引用插回；祖先被删（parent 已不在文档）则丢弃该条
  'document.addEventListener("keydown",function(e){',
  'if(!active)return;',
  'if((e.ctrlKey||e.metaKey)&&(e.key==="z"||e.key==="Z")){',
  'e.preventDefault();',
  'var top=undoStack.pop();if(!top)return;',
  'if(top.parent&&top.parent.isConnected){',
  'top.parent.insertBefore(top.el,(top.next&&top.next.isConnected)?top.next:null);',
  '}',
  '}',
  '},true);',
  'window.addEventListener("message",function(e){',
  'var d=e.data;if(!d||typeof d!=="object")return;',
  'if(d.type==="sp-html-edit"){',
  'active=!!d.on;',
  'if(!active){setHover(null);undoStack.length=0;}',
  '}else if(d.type==="sp-html-collect"){',
  // 序列化纯净性：克隆后剔除全部注入物与 hover class，再 outerHTML
  'setHover(null);',
  'var clone=document.documentElement.cloneNode(true);',
  'var inj=clone.querySelectorAll("[data-sp-inject]");',
  'for(var i=0;i<inj.length;i++)inj[i].remove();',
  'var hov=clone.querySelectorAll("."+HOVER);',
  'for(var j=0;j<hov.length;j++)hov[j].classList.remove(HOVER);',
  'window.parent.postMessage({type:"sp-html-save",html:clone.outerHTML},"*");',
  '}',
  '});',
  '})();',
].join('\n')
```

- [ ] **Step 5: 实现装配链注入**

Rewrite `src/lib/html-srcdoc.ts` 全文件：

```ts
/**
 * HTML 预览 srcdoc 装配链：在原文基础上注入
 * 1. <base target="_blank"> —— 链接点击走 window.open → 系统浏览器
 * 2. <style>html{zoom:F !important}</style> —— 整页等比缩放，随 writingUIFontSize 档位
 * 3. 删除模式 hover 样式 + 脚本 —— 常驻休眠，postMessage 激活（2026-08-24 删除模式）
 * 所有注入节点带 data-sp-inject：保存写回前由删除脚本克隆剔除，保证存回文件无注入物。
 */

import { HTML_DELETE_HOVER_STYLE, HTML_DELETE_SCRIPT } from './html-delete-script'

function injectBaseTarget(html: string): string {
  const base = '<base target="_blank" data-sp-inject>'
  const headMatch = /<head[^>]*>/i.exec(html)
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length
    return html.slice(0, at) + base + html.slice(at)
  }
  return base + html
}

function injectZoom(html: string, zoom: number): string {
  const style = `<style data-sp-inject>html{zoom:${zoom} !important}</style>`
  const closeMatch = /<\/head>/i.exec(html)
  if (closeMatch) {
    return html.slice(0, closeMatch.index) + style + html.slice(closeMatch.index)
  }
  return style + html
}

function injectDeleteMode(html: string): string {
  const payload =
    `<style data-sp-inject>${HTML_DELETE_HOVER_STYLE}</style>` +
    `<script data-sp-inject>${HTML_DELETE_SCRIPT}</script>`
  const closeMatch = /<\/body>/i.exec(html)
  if (closeMatch) {
    return html.slice(0, closeMatch.index) + payload + html.slice(closeMatch.index)
  }
  return html + payload
}

export function buildPreviewSrcdoc(html: string, zoom: number): string {
  // 先 zoom 后 base：无 <head> 时两者都前置，保证 <base> 仍在文档最前（与既有行为一致）；
  // 删除脚本最后注入（</body> 前），不干扰 head 装配。
  return injectDeleteMode(injectBaseTarget(injectZoom(html, zoom)))
}
```

- [ ] **Step 6: 实现主进程写回 + 四层 IPC**

`electron/lib/writing-tree.ts` — `writeWritingFile` 函数结束后（第 322 行 `}` 后）加：

```ts
/**
 * HTML 原文写回（删除模式专用）：不经 gray-matter/frontmatter 合并，逐字节写回。
 * 写前按天备份（复用 maybeBackupDaily；repository 根天然无备份）。仅接受 .html。
 */
export function writeHtmlFile(lib: string, rel: string, html: string): void {
  const absPath = assertInsideRoots(lib, rel)
  if (path.extname(absPath).toLowerCase() !== '.html') {
    throw Object.assign(new Error(`仅支持写回 .html 文件: ${rel}`), { code: 'WRITING_PATH_FORBIDDEN' })
  }
  const existingRaw = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : null
  maybeBackupDaily(lib, rel, existingRaw)
  fs.writeFileSync(absPath, html, 'utf-8')
}
```

注意：`maybeBackupDaily` 声明在文件后段（第 352 行），函数声明提升，顺序无妨。

`src/types/index.ts` 第 829 行后加：

```ts
  writingSaveHtml: (a: { path: string; html: string }) => Promise<WritingResult<null>>
```

`electron/ipc/writing.ts` — `writing:openInSystem` handler（第 163-170 行）后加：

```ts
  // HTML 删除模式写回（原文，含按天备份；校验在 writeHtmlFile 内）
  ipcMain.handle('writing:saveHtml', (_, a: { path: string; html: string }) =>
    wrapWriting(() => { tree.writeHtmlFile(lib, a.path, a.html); return null }))
```

`electron/preload.ts` 第 187 行后加：

```ts
  writingSaveHtml: (a) => ipcRenderer.invoke('writing:saveHtml', a),
```

`src/lib/ipc.ts` 第 125 行后加：

```ts
  get writingSaveHtml() { return ensure().writingSaveHtml },
```

- [ ] **Step 7: 跑测试确认通过 + 类型检查**

Run: `npx vitest run tests/html-srcdoc.test.ts tests/writing-backup.test.ts && npx tsc --noEmit`
Expected: 全部 PASS；tsc 无错误

- [ ] **Step 8: Commit**

```bash
git add src/lib/html-delete-script.ts src/lib/html-srcdoc.ts src/types/index.ts electron/lib/writing-tree.ts electron/ipc/writing.ts electron/preload.ts src/lib/ipc.ts tests/html-srcdoc.test.ts tests/writing-backup.test.ts
git commit -m "feat(writing): HTML 删除模式底座——srcdoc 注入删除脚本(data-sp-inject 标记)+writeHtmlFile 写回链(按天备份)"
```

---

### Task 2: HtmlPreview 删除模式 UI + postMessage 协议 + store 接线

**Files:**
- Modify: `src/components/writing/HtmlPreview.tsx`（近全文重写）
- Modify: `src/components/writing/WritingBoard.tsx:61`（加 `deletable` prop）
- Modify: `src/store/index.ts`（state 接口 ~396 行区、actions 接口 ~437 行区、初始值、selectWritingFile 2537 行）
- Modify: `src/pages/Briefing.tsx:328-337`（两个字号按钮 disabled 接线）
- Test: `tests/writing-store.test.ts`

**Interfaces:**
- Consumes: Task 1 的 postMessage 协议与 `ipc.writingSaveHtml`；store 现有 `showToast`。
- Produces（Task 3 依赖）:
  - testid：`writing-html-delete-enter`、`writing-html-delete-done`
  - store：`htmlDeleteMode: boolean`、`htmlDeleteDirty: boolean`、`htmlDeleteFlush: (() => Promise<boolean>) | null`；`setHtmlDeleteMode(on: boolean)`、`setHtmlDeleteDirty(dirty: boolean)`、`registerHtmlDeleteFlush(fn: (() => Promise<boolean>) | null)`
  - `selectWritingFile` 开头 flush 门：flush 返回 false 时中止切换

- [ ] **Step 1: 写失败测试 — store flush 门**

`tests/writing-store.test.ts` 第 25 行 beforeEach 的 setState 加 `htmlDeleteFlush: null`：

```ts
useStore.setState({ writingTree: null, writingFile: null, writingError: null, writingOrder: {}, writingExpandedGroups: {}, htmlDeleteFlush: null })
```

文件内追加 describe（放在 `selectWritingFile` describe 之后）：

```ts
describe('selectWritingFile × htmlDeleteFlush', () => {
  it('切换前调用已注册的 flush；flush 失败则中止切换', async () => {
    vi.mocked(ipc.writingRead).mockResolvedValue({
      ok: true,
      value: { frontmatter: { title: 'a', type: 'writing' }, body: '# a\n' }
    })

    const flushFail = vi.fn().mockResolvedValue(false)
    useStore.setState({ htmlDeleteFlush: flushFail })
    await useStore.getState().selectWritingFile('writing/a.md')
    expect(flushFail).toHaveBeenCalledTimes(1)
    expect(useStore.getState().writingFile).toBeNull() // 中止：未读取新文件

    const flushOk = vi.fn().mockResolvedValue(true)
    useStore.setState({ htmlDeleteFlush: flushOk })
    await useStore.getState().selectWritingFile('writing/a.md')
    expect(flushOk).toHaveBeenCalledTimes(1)
    expect(useStore.getState().writingFile?.path).toBe('writing/a.md')
  })

  it('未注册 flush 时正常切换', async () => {
    vi.mocked(ipc.writingRead).mockResolvedValue({
      ok: true,
      value: { frontmatter: { title: 'a', type: 'writing' }, body: '# a\n' }
    })
    await useStore.getState().selectWritingFile('writing/a.md')
    expect(useStore.getState().writingFile?.path).toBe('writing/a.md')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-store.test.ts`
Expected: FAIL — 未注册 flush 用例可能过，但「flush 失败中止切换」用例失败（当前 selectWritingFile 不认识 htmlDeleteFlush，照常切换）

- [ ] **Step 3: store 三处接线**

`src/store/index.ts`：

a) state 接口（`writingFile` 声明附近，~396 行区）加：

```ts
  // HTML 删除模式（非持久；仅主写作板 HtmlPreview deletable 实例驱动）
  htmlDeleteMode: boolean
  htmlDeleteDirty: boolean
  htmlDeleteFlush: (() => Promise<boolean>) | null
```

b) actions 接口（`selectWritingFile` 声明附近，~437 行区）加：

```ts
  setHtmlDeleteMode: (on: boolean) => void
  setHtmlDeleteDirty: (dirty: boolean) => void
  registerHtmlDeleteFlush: (fn: (() => Promise<boolean>) | null) => void
```

c) 初始 state（`writingTree: null` 所在初始化对象内）加：

```ts
  htmlDeleteMode: false,
  htmlDeleteDirty: false,
  htmlDeleteFlush: null,
```

d) actions 实现（`selectWritingFile` 实现前）加：

```ts
  setHtmlDeleteMode: (on) => set({ htmlDeleteMode: on }),
  setHtmlDeleteDirty: (dirty) => set({ htmlDeleteDirty: dirty }),
  registerHtmlDeleteFlush: (fn) => set({ htmlDeleteFlush: fn }),
```

e) `selectWritingFile`（2537 行）开头插入 flush 门：

```ts
  selectWritingFile: async (filePath: string | null) => {
    const seq = ++writingSelectSeq
    // HTML 删除模式有未写回删除时先 flush（退出=自动写回）；失败中止切换，避免静默丢改动
    const htmlFlush = get().htmlDeleteFlush
    if (htmlFlush && !(await htmlFlush())) return
    if (!filePath) return set({ writingFile: null })
```

- [ ] **Step 4: 跑 store 测试确认通过**

Run: `npx vitest run tests/writing-store.test.ts`
Expected: PASS

- [ ] **Step 5: HtmlPreview 删除模式**

Rewrite `src/components/writing/HtmlPreview.tsx` 全文件：

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { buildPreviewSrcdoc } from '@/lib/html-srcdoc'
import { WRITING_HTML_ZOOM } from '@/lib/briefing-font-size'

type HtmlFile = {
  path: string
  body: string
  previewError?: string
}

// 取路径最后一段作为显示名（兼容 / 与 \）
function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

const FLUSH_TIMEOUT_MS = 3000

// deletable: 仅主写作板（WritingBoard）传入；对照槽（CompanionBoard）复用本组件但保持
// 只读，避免两个实例争抢 store 的 flush 注册（spec 2026-08-24 §交互与 UI 出口）。
export function HtmlPreview({ file, deletable }: { file: HtmlFile; deletable?: boolean }) {
  const showToast = useStore(s => s.showToast)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const deleteMode = useStore(s => s.htmlDeleteMode)
  const setHtmlDeleteMode = useStore(s => s.setHtmlDeleteMode)
  const setHtmlDeleteDirty = useStore(s => s.setHtmlDeleteDirty)
  const registerHtmlDeleteFlush = useStore(s => s.registerHtmlDeleteFlush)
  const [opening, setOpening] = useState(false)
  const [saving, setSaving] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // 组件不随 file.path 重建（无 key），flush 闭包必须经 ref 读最新 file
  const fileRef = useRef(file)
  fileRef.current = file

  // srcdoc 装配：<base target="_blank">（链接走系统浏览器）+ zoom 注入（随字号档位整页等比缩放）
  // + 删除模式脚本（常驻休眠）。沙箱无 allow-same-origin，父进程碰不到内部 DOM，
  // 只能在字符串生成期注入。调档位 → srcdoc 变化 → iframe 整体重载，已知取舍见 spec。
  const srcDoc = useMemo(
    () => buildPreviewSrcdoc(file.body, WRITING_HTML_ZOOM[writingUISize]),
    [file.body, writingUISize],
  )

  // 接收 iframe 回传 dirty。opaque origin 无法校验 origin，只校验 source 是当前 iframe。
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return
      const d = e.data as { type?: string } | null
      if (d?.type === 'sp-html-dirty') setHtmlDeleteDirty(true)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [setHtmlDeleteDirty])

  // flush：退出删除模式前把删除结果写回文件。返回 false = 失败，调用方应中止后续动作
  // （selectWritingFile 据此中止切换，避免静默丢改动）。
  useEffect(() => {
    if (!deletable) return
    const flush = async (): Promise<boolean> => {
      const st = useStore.getState()
      if (!st.htmlDeleteMode) return true
      const win = iframeRef.current?.contentWindow
      const exitMode = () => {
        win?.postMessage({ type: 'sp-html-edit', on: false }, '*')
        st.setHtmlDeleteMode(false)
        st.setHtmlDeleteDirty(false)
      }
      if (!st.htmlDeleteDirty || !win) { exitMode(); return true }
      setSaving(true)
      try {
        const html = await new Promise<string | null>((resolve) => {
          const onMsg = (e: MessageEvent) => {
            if (e.source !== win) return
            const d = e.data as { type?: string; html?: unknown } | null
            if (d?.type !== 'sp-html-save' || typeof d.html !== 'string') return
            done(d.html)
          }
          const timer = setTimeout(() => done(null), FLUSH_TIMEOUT_MS)
          function done(v: string | null) {
            clearTimeout(timer)
            window.removeEventListener('message', onMsg)
            resolve(v)
          }
          window.addEventListener('message', onMsg)
          win.postMessage({ type: 'sp-html-collect' }, '*')
        })
        if (html === null) {
          showToast('HTML 写回失败：预览无响应，请重试')
          return false
        }
        const f = fileRef.current
        const out = (/^\s*<!doctype/i.test(f.body) ? '<!DOCTYPE html>\n' : '') + html
        const r = await ipc.writingSaveHtml({ path: f.path, html: out })
        if (!r.ok) {
          showToast('HTML 写回失败: ' + r.message)
          return false
        }
        exitMode()
        return true
      } finally {
        setSaving(false)
      }
    }
    registerHtmlDeleteFlush(flush)
    return () => registerHtmlDeleteFlush(null)
  }, [deletable, registerHtmlDeleteFlush, showToast])

  const enterDeleteMode = () => {
    setHtmlDeleteMode(true)
    iframeRef.current?.contentWindow?.postMessage({ type: 'sp-html-edit', on: true }, '*')
  }
  const doneDeleteMode = async () => {
    const flush = useStore.getState().htmlDeleteFlush
    if (flush) await flush()
  }

  // 核心兜底入口：调系统默认程序打开原始文件
  const handleOpen = async () => {
    if (opening) return
    setOpening(true)
    try {
      const r = await ipc.writingOpenInSystem({ path: file.path })
      if (!r.ok) showToast(r.message || '打开失败')
    } catch (err) {
      showToast('打开失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div data-testid="writing-html-preview" className="flex flex-col h-full min-h-0">
      {/* 顶部信息栏：文件名 + 类型徽标 + 删除模式 + 系统打开按钮 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-parchment/10 shrink-0">
        <span
          data-testid="writing-preview-filename"
          className="truncate text-sm min-w-0"
          style={{ color: 'var(--writing-tone-color)' }}>
          {basename(file.path)}
        </span>
        <span
          data-testid="writing-preview-kind"
          className="shrink-0 px-1.5 py-0.5 rounded text-[10px] border border-parchment/20 text-parchment/60">
          HTML
        </span>
        <div className="flex-1" />
        {deletable && !file.previewError && (
          deleteMode ? (
            <>
              <span data-testid="writing-html-deleting-badge" className="shrink-0 text-[10px] text-ember/80">
                删除中：点击块删除，Ctrl+Z 撤销
              </span>
              <button
                data-testid="writing-html-delete-done"
                onClick={() => void doneDeleteMode()}
                disabled={saving}
                className="shrink-0 px-2.5 py-1 text-xs text-ember border border-ember/40 rounded hover:bg-ember/10 disabled:opacity-50 transition-colors">
                {saving ? '写回中…' : '完成'}
              </button>
            </>
          ) : (
            <button
              data-testid="writing-html-delete-enter"
              onClick={enterDeleteMode}
              className="shrink-0 px-2.5 py-1 text-xs text-parchment/70 border border-parchment/25 rounded hover:bg-parchment/10 transition-colors"
              title="进入删除模式：点击正文中的块将其删除，完成时自动写回">
              删除模式
            </button>
          )
        )}
        <button
          data-testid="writing-preview-open"
          onClick={handleOpen}
          disabled={opening}
          className="shrink-0 px-2.5 py-1 text-xs text-ember border border-ember/40 rounded hover:bg-ember/10 disabled:opacity-50 transition-colors">
          {opening ? '打开中…' : '用系统程序打开'}
        </button>
      </div>

      {/* 内容区：iframe srcdoc 沙箱渲染；出错时展示错误文案 + 系统打开兜底 */}
      {file.previewError ? (
        <div
          data-testid="writing-preview-error"
          className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-sm text-parchment/60 text-center px-8">
          <p>{file.previewError.includes('文件过大') ? '文件过大，无法在应用内预览，请用系统程序打开' : '文件读取失败'}</p>
          <button
            data-testid="writing-preview-error-open"
            onClick={handleOpen}
            disabled={opening}
            className="px-2.5 py-1 text-xs text-ember border border-ember/40 rounded hover:bg-ember/10 disabled:opacity-50 transition-colors">
            {opening ? '打开中…' : '用系统程序打开'}
          </button>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          data-testid="writing-html-preview-iframe"
          title={basename(file.path)}
          // allow-popups:srcdoc 注入 <base target="_blank">,点击链接是弹窗请求,
          // 缺 allow-popups 会被沙箱静默拦截(点了没反应);弹窗由 main.ts
          // setWindowOpenHandler 拦截并路由到系统浏览器(与 ConstitutionReportView 同一模式)
          sandbox="allow-scripts allow-popups"
          srcDoc={srcDoc}
          className="flex-1 min-h-0 w-full border-0 bg-white"
        />
      )}
    </div>
  )
}
```

`src/components/writing/WritingBoard.tsx` 第 61 行改为：

```tsx
          <HtmlPreview deletable file={{ path: file.path, body: file.body, previewError: file.previewError }} />
```

- [ ] **Step 6: Briefing 字号按钮删除模式下锁定**

`src/pages/Briefing.tsx`：

a) 现有 `writingUISize` 的 useStore 选择器附近加：

```ts
const htmlDeleteMode = useStore(s => s.htmlDeleteMode)
```

b) 第 328-337 行两个按钮改为（只改 `disabled` 与 `title` 两行，其余不动）：

```tsx
                  <button type="button" data-testid="writing-ui-font-size-decrease"
                    disabled={writingUISize === 'sm' || htmlDeleteMode}
                    onClick={() => void decreaseWritingUI()}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title={htmlDeleteMode ? '删除模式下不可调整字号' : '减小界面字号'}>−</button>
                  <button type="button" data-testid="writing-ui-font-size-increase"
                    disabled={writingUISize === '7xl' || htmlDeleteMode}
                    onClick={() => void increaseWritingUI()}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title={htmlDeleteMode ? '删除模式下不可调整字号' : '增大界面字号'}>+</button>
```

- [ ] **Step 7: 类型检查 + 相关测试**

Run: `npx tsc --noEmit && npx vitest run tests/writing-store.test.ts`
Expected: tsc 无错误；测试 PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/writing/HtmlPreview.tsx src/components/writing/WritingBoard.tsx src/store/index.ts src/pages/Briefing.tsx tests/writing-store.test.ts
git commit -m "feat(writing): HTML 删除模式 UI——点块删除/Ctrl+Z/完成写回,store flush 门+字号锁定"
```

---

### Task 3: E2E 删除链路

**Files:**
- Modify: `e2e/specs/writing-non-md.spec.ts`（追加两个 test）
- Modify: `e2e/source-map.json:67-72`（writing group sources 加 `src/lib/html-*.ts`）

**Interfaces:**
- Consumes: Task 2 的 testid（`writing-html-delete-enter`/`writing-html-delete-done`）、store 字段、`writingSaveHtml` IPC；fixture `报告.html`（本文件 `seedNonMdFiles` 已 seed，含 `<p>HTML 原生渲染</p>` 与 `<h1>月度报告</h1>`）。
- Produces: 无（终端任务）。

- [ ] **Step 1: 追加 E2E 用例**

`e2e/specs/writing-non-md.spec.ts` 的 `test.describe` 内末尾追加：

```ts
  test('HTML 删除模式：点块删除 + Ctrl+Z 撤销 + 完成写回（磁盘无注入物残留）', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报告.html' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()
    await expect(window.getByTestId('writing-html-preview-iframe')).toBeVisible({ timeout: 5000 })

    // IPC 暴露断言（ipc-state §1：新 IPC 至少一个运行时断言）
    const exposed = await window.evaluate(() => typeof (window as any).api?.writingSaveHtml === 'function')
    expect(exposed).toBe(true)

    // 进入删除模式 → 顶栏切到「完成」+ 字号按钮锁定
    await window.getByTestId('writing-html-delete-enter').click()
    await expect(window.getByTestId('writing-html-delete-done')).toBeVisible()
    await expect(window.getByTestId('writing-ui-font-size-increase')).toBeDisabled()
    await expect(window.getByTestId('writing-ui-font-size-decrease')).toBeDisabled()

    // frameLocator 穿透沙箱：hover + 点击块即删
    const frame = window.frameLocator('[data-testid="writing-html-preview-iframe"]')
    const target = frame.locator('p', { hasText: 'HTML 原生渲染' })
    await expect(target).toHaveCount(1)
    await target.hover()
    await target.click()
    await expect(target).toHaveCount(0)

    // Ctrl+Z 撤销恢复（点击后焦点已在 iframe 内，keyboard 事件直达 iframe document）
    await window.keyboard.press('Control+z')
    await expect(target).toHaveCount(1)

    // 再删 → 完成 → 自动写回
    await target.hover()
    await target.click()
    await expect(target).toHaveCount(0)
    await window.getByTestId('writing-html-delete-done').click()
    await expect(window.getByTestId('writing-html-delete-enter')).toBeVisible({ timeout: 5000 })

    // 磁盘断言：块已删、doctype 保留、无任何注入物残留
    const saved = fs.readFileSync(path.join(testLibraryPath, 'writing', '报告.html'), 'utf-8')
    expect(saved).not.toContain('HTML 原生渲染')
    expect(saved).toContain('月度报告')
    expect(saved).toMatch(/^<!DOCTYPE html>/i)
    expect(saved).not.toContain('data-sp-inject')
    expect(saved).not.toContain('sp-del-hover')
    expect(saved).not.toContain('sp-html-collect')

    // 按天备份 = 修改前版本
    const backup = fs.readFileSync(path.join(testLibraryPath, 'writing', '.backups', '报告.html'), 'utf-8')
    expect(backup).toContain('HTML 原生渲染')
  })

  test('HTML 删除模式：脏状态切换文件自动写回', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报告.html' })
    await expect(node).toBeVisible({ timeout: 5000 })
    await node.click()
    await expect(window.getByTestId('writing-html-preview-iframe')).toBeVisible({ timeout: 5000 })

    await window.getByTestId('writing-html-delete-enter').click()
    const frame = window.frameLocator('[data-testid="writing-html-preview-iframe"]')
    const target = frame.locator('p', { hasText: 'HTML 原生渲染' })
    await target.hover()
    await target.click()
    await expect(target).toHaveCount(0)

    // 切到 xlsx：selectWritingFile 头部 flush 门先写回再读取，预览出现即写盘已完成
    await window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '报表.xlsx' }).click()
    await expect(window.getByTestId('writing-readonly-preview')).toBeVisible({ timeout: 5000 })
    const saved = fs.readFileSync(path.join(testLibraryPath, 'writing', '报告.html'), 'utf-8')
    expect(saved).not.toContain('HTML 原生渲染')
  })
```

- [ ] **Step 2: source-map 补 html-srcdoc 覆盖**

`e2e/source-map.json` writing group 的 `sources` 数组（第 67-72 行）加一行：

```json
        "src/lib/html-*.ts",
```

（`writing-non-md.spec.ts` 已被 specs glob `writing-*.spec.ts` 覆盖，无需加 specs；但 `src/lib/html-srcdoc.ts` / `html-delete-script.ts` 此前不在任何 group 的 sources，补上后改动它们才会触发本 spec。）

- [ ] **Step 3: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: `writing-non-md.spec.ts` 全绿（含既有 4 条 + 新增 2 条）；`startup-health` 绿

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/writing-non-md.spec.ts e2e/source-map.json
git commit -m "test(writing): HTML 删除模式 E2E——点删/撤销/写回纯净性/备份/脏切换自动写回/字号锁定/IPC 暴露"
```

---

## Self-Review 记录

- **Spec 覆盖**：删除模式交互（Task 2 Step 5）、序列化纯净性（Task 1 Step 4/5 + Task 3 磁盘断言）、postMessage/安全（Task 1 Step 4 source 校验在 Task 2 Step 5）、写 IPC+备份（Task 1 Step 6）、脏状态切换保护（Task 2 Step 3e + Task 3 用例 2）、撤销（Task 1 Step 4）、字号锁定（Task 2 Step 6）、验收清单逐条有用例或步骤对应。
- **类型一致性**：`writingSaveHtml` 签名四层一致；flush 类型 `(() => Promise<boolean>) | null` store 接口/实现/HtmlPreview/selectWritingFile 四处一致；postMessage 四个 type 字符串在脚本/组件/E2E 一致。
- **已知留白**：Ctrl+Z 的键盘焦点依赖「点击后焦点在 iframe」——若 Task 3 Step 3 该断言 flaky，在用例中 `target.click()` 前先 `frame.locator('body').click({ position: { x: 1, y: 1 } })` 之外无更好手段（删除模式下点击空白不删块，因 blockOf 对 body/html 返回 null）；先按现状跑，失败再处理。
