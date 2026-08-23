# 写作库 HTML 删除模式 — 设计 + 实现计划（合并）

日期：2026-08-24
状态：已确认（删除模式，无批注、无放弃出口），spec/plan 合并（任务量小）

## 背景

写作库中的自包含 `.html` 报告（外部工具生成，如 Hermes 日报）自 2026-08-20 起可在应用内 iframe 原生渲染，但只读。用户阅读时想删掉噪音段落（广告、重复段落等）。本期引入**删除模式**：仅删除整块，不做文字编辑、不做批注。

## 已确认约束（用户问答）

1. 只做「删整块」——不做文字级编辑（contenteditable 方案的 IME/选区边界风险不为未验证的需求预付），不做批注区。
2. 交互最简：hover 高亮 → **点击块即删**（无浮出删除按钮）；退出删除模式 = 自动写回，无独立「保存」按钮。
3. **无「放弃整轮删除」出口**：误删单块靠 Ctrl+Z 撤销；极端情况去 `writing/.backups` 按天备份找文件。
4. 未来若要升级到文字级编辑，底座（注入脚本 / postMessage / 写 IPC / 备份）完全复用，是纯增量。

## 目标 / 非目标

**目标**

- HTML 预览顶栏新增「删除模式」入口；编辑态下 hover 块高亮、点击删除、Ctrl+Z 撤销。
- 退出删除模式自动写回文件（写前按天备份），iframe 不重载。
- 保存的 HTML 不含任何注入物（base / zoom style / 编辑脚本 / 高亮 class），结构同原始文件。
- 切换文件自动退出删除模式并写回。

**非目标**

- 文字级编辑、批注、拖排、结构插入。
- 「放弃不保存」出口。
- 多级撤销的持久化（撤销栈仅存活于当前删除会话，退出即清）。
- 删除整个嵌套结构的快捷方式（删 section 需逐块删；closest 命中最小块）。

## 设计

### 交互与 UI 出口（feature-development §12）

- HtmlPreview 顶栏新增「删除模式」按钮（`writing-html-delete-enter`），位于「用系统程序打开」左侧。进入后变为「完成」（`writing-html-delete-done`），并有「删除中」态徽标提示。
- **删除模式仅主写作板启用**：`CompanionBoard` 也复用 `HtmlPreview`（对照槽），通过 `deletable` prop 区分——只有主槽传入，避免两个实例争抢 store 的 flush 注册。对照槽保持只读。
- 删除模式下：
  - hover 块级元素 → 高亮描边（注入样式表 `.sp-del-hover { outline: 2px solid #d97757 }`）。
  - 点击 → 命中块 `remove()`，置脏。
  - Ctrl+Z → 撤销上一次删除（栈式）。
- 「完成」→ 收集序列化 HTML → 写回 → 退出删除模式。iframe 不重载（当前 DOM 已是删后状态）。
- 删除模式期间禁用 −/+ 字号按钮（`writing-ui-font-size-*`，在 `Briefing.tsx`）：调字号重建 srcdoc 会丢未写盘的删除。disabled + `title="删除模式下不可调整字号"`。
- 删除块选择器：`p, li, blockquote, pre, tr, table, h1-h6, figure, section, article`；`closest()` 命中最小块；排除 `html/body`。

### 注入脚本与激活模型

- `buildPreviewSrcdoc(html, zoom)` 增加第三段注入：**编辑脚本** `<script data-sp-inject>`（与 base、zoom 同一条装配链，插在 `</body>` 前，无 body 则尾置）。
- 脚本常驻但休眠；父进程 postMessage `{type:'sp-html-edit', on:true|false}` 激活/休眠——**进入/退出不重建 srcdoc**，不丢滚动位置。
- 删除模式下的点击监听走 capture + `preventDefault()` + `stopPropagation()`：阻止链接导航（base target 会把点击送去系统浏览器）和页面脚本响应。

### 序列化纯净性（关键技术点）

直接 `outerHTML` 会把注入物（`<base>`、zoom `<style>`、编辑脚本）存进用户文件、下次打开双重注入。因此：

1. **所有注入节点统一打 `data-sp-inject` 属性**——包括既有的 `<base target="_blank">` 和 zoom `<style>`（本期给它们补上标记）。
2. 保存时：先清掉当前 hover 的 `.sp-del-hover` class → `document.documentElement.cloneNode(true)` → 克隆上 `querySelectorAll('[data-sp-inject]').forEach(remove)` → 序列化；原文有 `<!DOCTYPE` 则补 doctype 前缀。
3. 存回的文件 = 原始文件 − 被删的块，无注入物残留。

### postMessage 协议与安全

- iframe→父：`{type:'sp-html-dirty'}`（首次删除时发一次）、`{type:'sp-html-save', html}`（响应收集请求）。
- 父→iframe：`{type:'sp-html-edit', on}`、`{type:'sp-html-collect'}`（请求序列化）。
- 父进程监听 `message` 时校验 `event.source === iframe.contentWindow`（opaque origin 下 origin 恒为 "null"，只能校验 source）。
- **保持 opaque origin，不加 `allow-same-origin`**（2026-08-20 spec 已定的安全边界，本期不碰）。
- 父进程只在删除模式期间接受 `sp-html-save`，且只写当前打开的文件——page 脚本伪造消息的危害限于覆盖文件自身，可接受。

### 写 IPC 与备份（四层同步，ipc-state §1/§2）

| 层 | 改动 |
|---|---|
| `src/types/index.ts` | `IpcApi` 加 `writingSaveHtml(a: { path: string; html: string }): Promise<WritingResult<null>>`（对齐 `writingOpenInSystem` 签名风格） |
| `electron/lib/writing-tree.ts` | 新增 `writeHtmlFile(lib, rel, html)`：`assertInsideRoots` 校验 + 仅 `.html` 扩展名 + 调 `maybeBackupDaily`（已存在，同模块直接复用）+ 原文写回（**不经** `writeWritingFile`——它走 gray-matter frontmatter 合并，只适用 md） |
| `electron/ipc/writing.ts` | 注册 `writing:saveHtml` handler（path → rel，校验在 writing 根内） |
| `electron/preload.ts` + `src/lib/ipc.ts` | 暴露与 facade |

### 脏状态与切换保护

- store 新增非持久字段：`htmlDeleteMode: boolean`、`htmlDeleteDirty: boolean`、`htmlDeleteFlush: (() => Promise<boolean>) | null`（主槽 HtmlPreview mount 时注册 flush 回调）。
- flush 返回 `boolean`：true = 可继续（写回成功或无脏改动）；false = 失败/超时，**调用方中止后续动作**。
- flush = 发 `sp-html-collect` → 等 `sp-html-save`（3s 超时护栏）→ 调 `writingSaveHtml` → 成功后清 dirty、退出删除模式。非脏时直接退出删除模式。
- `selectWritingFile` 开头 `const f = get().htmlDeleteFlush; if (f && !(await f())) return`——切换文件 = 自动退出删除模式并写回，所有切换入口（树点击、tab 切换）天然覆盖；flush 失败则中止切换，避免静默丢改动。
- 字号按钮禁用读 `htmlDeleteMode`（`Briefing.tsx`）。

### 撤销

- 注入脚本维护栈：`{ el, parent, nextSibling }`（活 DOM 引用）。
- Ctrl+Z（iframe 内 keydown）：`parent.insertBefore(el, nextSibling)` 恢复；若 `parent` 已不在文档中（祖先也被删）则丢弃该条。
- 退出删除模式清空栈。

### 错误处理

- 写盘失败 → toast 错误文案 + 保持删除模式与脏标记（不丢 DOM 状态，可重试完成）。
- flush 超时/无响应 → 视为写盘失败同路径；切换文件中止（不继续 selectWritingFile，避免静默丢改动）。
- 文件保存期间被外部删除 → 主进程写失败 → 同一 toast 路径。

## 验收清单（feature-development §1/§11）

- [ ] HTML 预览顶栏出现「删除模式」按钮，进入后 hover 块高亮、点击即删
- [ ] 删块 → 完成 → 重进文件，被删块已消失
- [ ] 保存的文件无 `data-sp-inject`、无编辑脚本、无 zoom style、无 base 残留（磁盘断言）
- [ ] 写回前 `writing/.backups` 生成当日备份；同天二次删除不重复备份
- [ ] 删除模式下 Ctrl+Z 逐条恢复；退出后栈清空
- [ ] 删除模式下 −/+ 字号按钮 disabled
- [ ] 删除模式下点击链接不跳转（capture 拦截）
- [ ] 脏状态切换文件 → 自动写回，新文件正常加载
- [ ] 非删除模式下阅读行为与现状完全一致（缩放、链接、系统打开）
- [ ] 真实 Hermes 日报删块后排版不崩（手测）

## 实现计划（TDD，三个任务）

### Task 1：srcdoc 注入 + 写 IPC 主进程链（先测后码）

1. 测试：
   - 扩展 `tests/html-preview.test.ts`：`buildPreviewSrcdoc` 产出含 `data-sp-inject` 标记的 base/zoom/编辑脚本；无 `<head>`/`<body>` 时注入位置正确。
   - 扩展 `tests/writing-backup.test.ts` / `tests/writing-tree.test.ts`：`writeHtmlFile` 写原文、触发按天备份、拒绝非 `.html`、拒绝根外路径。
2. 实现：`src/lib/html-srcdoc.ts`（补标记 + 编辑脚本注入，脚本体放独立模板常量）；`writing-tree.ts` `writeHtmlFile`；types/preload/facade/handler 四层。
3. 验证：`npx vitest run tests/html-preview.test.ts tests/writing-backup.test.ts tests/writing-tree.test.ts`（只跑改动对应文件，general §9）

### Task 2：HtmlPreview 删除模式 UI + postMessage 协议 + store

1. `HtmlPreview.tsx`：删除模式状态机、`message` 监听（source 校验）、flush 注册。
2. `src/store/index.ts`：`htmlDeleteMode` / `htmlDeleteDirty` / `htmlDeleteFlush`；`selectWritingFile` 头部 flush。
3. `Briefing.tsx`：字号按钮 disabled 接线。
4. 验证：`npx tsc --noEmit` + 相关 store 测试（若有 selectWritingFile 用例则扩展）。

### Task 3：E2E

1. 扩展 `e2e/specs/writing-non-md.spec.ts`（或新 spec，同步 `e2e/source-map.json`）：seed 报告.html → 进入删除模式 → frameLocator 点击块 → 块消失 → Ctrl+Z 恢复 → 再删 → 完成 → 读磁盘断言块消失且无 `data-sp-inject`/脚本残留 → 重进渲染正常。
2. 删除模式下字号按钮 disabled 断言。
3. 验证：`node scripts/e2e-changed.js --run --no-retries`

### 不做的事（防范围蔓延）

- 不动 ReadonlyPreview；不加 contenteditable；不做批注；不加 allow-same-origin。
- 不做删除动画/过渡（删除即消失，YAGNI）。
- 不处理 `repository/` 根的特殊性——备份机制天然只对 writing 根生效，repository 下 html 删除直接写回无备份（与 md 行为一致）。
