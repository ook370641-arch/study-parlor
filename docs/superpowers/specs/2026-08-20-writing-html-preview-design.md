# 写作库 HTML 原生渲染预览 — 设计 + 实现计划（合并）

日期：2026-08-20
状态：已确认方案 A（iframe + srcdoc），spec/plan 合并（任务量小）

## 背景

写作库（`writing/` + `repository/`）中会出现外部工具生成的自包含 `.html` 报告。当前树只识别 `.md` 和 `xlsx/pdf/docx`，HTML 文件不显示，用户必须在应用外打开。目标：HTML 文件出现在写作树中，点击后在主区域以**与浏览器一致的效果**渲染，只读。

## 已确认约束（用户问答）

1. 内容以静态排版为主（可有内联 CSS / 少量 JS）。
2. 只读预览即可，不做源码编辑（YAGNI）。
3. 文件完全自包含，不依赖同目录相对资源。

## 目标 / 非目标

**目标**

- `.html` 文件出现在写作树（与 xlsx/pdf/docx 同等待遇，含导入、catalog stub 摘要）。
- 点击后主区域用 sandboxed iframe 渲染原始 HTML，视觉与浏览器一致。
- 顶栏复刻 ReadonlyPreview 模式：文件名 + HTML 徽标 + 「用系统程序打开」兜底按钮。
- 页面内链接点击 → 系统浏览器打开（复用主窗口 `setWindowOpenHandler`，已存在）。

**非目标**

- HTML 源码编辑。
- 相对路径本地资源加载（用户确认自包含；若未来需要，再评估 `<webview>` 方案）。
- `.htm` 扩展名（可用重命名 workaround；YAGNI）。
- HTML 参与 AI 助手 read_local 的语义解析（read_local 对 html 返回原始源码，可接受，不专门处理）。

## 设计

### 数据流

```
树点击 .html
  → writingPreviewKindOf() 返回 'html'（isNonMdExt 扩展后自动生效）
  → store.selectWritingFile() kind !== 'md' 分支
  → ipc.writingReadPreview({ path })
  → file-preview.ts previewFile() 新增 html 分支：
      读 utf-8 原文，{ kind: 'html', title, content: 原文, truncated: false }
  → WritingBoard kind === 'html' → <HtmlPreview body={原文} path />
  → <iframe sandbox="allow-scripts" srcDoc={注入 <base target="_blank"> 后的 HTML} />
```

关键点：**html 分支不经任何解析器**（xlsx/docx/pdf 走 ExcelJS/mammoth/pdfjs 转 markdown；html 直接透传原文），这是工作量小的核心原因。

### 渲染与安全

- `sandbox="allow-scripts"`：允许简单 JS 运行，但 opaque origin——无 localStorage/无表单/无 top 导航。静态排版完全不受影响。
- 注入 `<base target="_blank">`（插到 `<head>` 后，若无 `<head>` 则前置）：使 `<a href>` 点击走 window.open → 冒泡到主窗口已有的 `setWindowOpenHandler` → `shell.openExternal` 系统浏览器打开，`deny` 新窗口。无需新增主进程逻辑。
- iframe 样式：`width:100%; height:100%; border:0; background:#fff`（HTML 页面自带白底假设，避免应用暗色主题穿透）。
- 大小护栏：原文 > 5MB 时抛 `PREVIEW_PARSE_ERROR`（"文件过大，请用系统程序打开"），走现有错误 UI + 系统打开兜底。防止内嵌 base64 大图的报告拖垮 IPC/渲染。

### 类型与跨层同步（ipc-state §1/§2）

| 层 | 改动 |
|---|---|
| `src/types/index.ts` | `NON_MD_EXTENSIONS` 加 `'html'`（`NonMdKind` 联合类型自动扩展） |
| `electron/lib/file-preview.ts` | `previewFile` 加 html 分支（读原文 + 5MB 护栏）；`nonMdKindOf` 无需改（走 isNonMdExt） |
| `src/components/writing/HtmlPreview.tsx` | 新组件（顶栏 + iframe + 系统打开按钮；**只导出组件**，ui-styling §10） |
| `src/components/writing/WritingBoard.tsx` | 非 md 分支内：`kind === 'html'` → HtmlPreview，否则 ReadonlyPreview |
| preload / IPC facade | 无改动（复用 `writing:readPreview` / `writing:openInSystem`） |

**自动生效、无需改动**：树扫描（scanDir 走 isNonMdExt）、`importBinaryFile` 导入、`collectNonMdFiles` catalog stub 摘要（显示为 "HTML 文件，可用 read_local 读取内容"）、重命名/移动/删除/备份生命周期（html 只读不经 `writeWritingFile`，按天备份天然不涉及）。

### UI 出口（feature-development §12）

- 入口 = 树中 `.html` 文件本身（与 xlsx/pdf/docx 同一协议，无新入口概念）。
- `data-testid`：`writing-html-preview`、`writing-html-preview-iframe`、`writing-preview-open`（复用现有命名）。

### 错误处理

- 读取/解析失败、超 5MB → `previewError('PREVIEW_PARSE_ERROR', …)`，store 已有非 md 失败路径（`previewError` 存码，组件展示文案 + 系统打开按钮）。
- 文件被外部删除：`previewFile` 已检查 `fs.existsSync` → PREVIEW_PARSE_ERROR，走同一 UI。

## 验收清单（feature-development §1/§11）

- [ ] writing/ 和 repository/ 下的 `.html` 出现在树中
- [ ] 点击后 iframe 渲染，内联 CSS/简单 JS 生效，效果与浏览器一致
- [ ] 内联 `<a href="https://…">` 点击 → 系统浏览器打开，应用内不弹新窗口
- [ ] 顶栏显示文件名 + HTML 徽标 + 「用系统程序打开」可用
- [ ] 超 5MB 文件 → 错误文案 + 系统打开兜底
- [ ] 文件不存在 → 错误 UI 而非白屏
- [ ] 切换文件/切换回 md 文章无残留状态
- [ ] 导入对话框可导入 .html（Office 过滤器扩充或所有文件兜底）

## 实现计划（TDD，两个任务）

### Task 1：主进程预览链 + 类型（先测后码）

1. 测试：扩展 `tests/` 中 file-preview 相关测试文件（若无则新建 `tests/html-preview.test.ts`）：
   - `previewFile` 对 `.html` 返回原文 content、kind='html'、truncated=false
   - 超 5MB → PREVIEW_PARSE_ERROR
   - 文件不存在 → PREVIEW_PARSE_ERROR
   - `isNonMdExt('html')` 为 true；`writingPreviewKindOf('a/b.html')` 为 'html'
2. 实现：`src/types/index.ts` 加扩展名；`file-preview.ts` 加 html 分支。
3. 验证：`npx vitest run tests/html-preview.test.ts`（只跑该文件，general §9）

### Task 2：渲染组件 + WritingBoard 分支

1. 新建 `HtmlPreview.tsx`：顶栏（文件名/HTML 徽标/系统打开按钮，样式复刻 ReadonlyPreview）+ iframe（srcDoc 注入 `<base target="_blank">`，sandbox="allow-scripts"）。
2. `WritingBoard.tsx` 非 md 分支分流 html。
3. 验证：
   - `npx vitest run tests/html-preview.test.ts`（若有组件侧用例一并跑）
   - E2E：新建/扩展 spec（seed 一个 .html 进 fixture 学习库 → 树出现 → 点击渲染 → testid 断言）；同步更新 `e2e/source-map.json`；`node scripts/e2e-changed.js --run --no-retries`

### 不做的事（防范围蔓延）

- 不动 ReadonlyPreview 内部实现（HtmlPreview 独立组件）。
- 不加编辑/源码视图切换。
- 不处理 .htm、相对资源、webview。

---

## 追加（2026-08-20 同日二期）：随字号档位等比缩放

### 背景与动机

HTML 预览上线后暴露问题：全屏状态下页面自带 `max-width`（如 800px）使内容呈"窄窄一条"，且预览不响应右上角 −/+ 字号控件（该控件驱动 `writingUIFontSize`，HTML iframe 内是独立文档，CSS 变量无法穿透）。目标：调字号 = 调整 HTML 整页缩放幅度。

### 已确认约束（用户问答）

1. 缩放语义 = **整页等比缩放**（CSS zoom，文字+图片+布局一起放大），不是只放大文字，也不强行覆盖页面 max-width。
2. 基准 = **base 档已放大 1.2x**（默认就嫌小）。

### 设计

- 沙箱为 `sandbox="allow-scripts"`（opaque origin），父进程碰不到 iframe 内部 DOM，缩放只能在 **srcdoc 字符串生成期**注入样式，与现有 `<base target="_blank">` 注入同一条装配链：
  `<style>html { zoom: FACTOR !important }</style>`，插到 `</head>` 之前（无 `<head>` 则前置文档头）。`!important` 压过页面自带样式；`zoom` 为 Chromium 原生支持的整页缩放（Electron 内可靠）。
- 档位映射：复用 `writingUIFontSize`（sm→7xl 共 10 档，ui-styling §6 / ipc-state §4），`briefing-font-size.ts` 新增 `WRITING_HTML_ZOOM` 常量，以 base=1.2 为基准、按正文字号比例（17→35px）等比：

  | 档 | sm | base | lg | xl | 2xl | 3xl | 4xl | 5xl | 6xl | 7xl |
  |---|---|---|---|---|---|---|---|---|---|---|
  | zoom | 1.07 | **1.20** | 1.33 | 1.45 | 1.58 | 1.71 | 1.83 | 1.96 | 2.08 | 2.21 |

- 改动面：
  - `src/lib/briefing-font-size.ts`：新增 `WRITING_HTML_ZOOM` 映射。
  - `src/lib/html-srcdoc.ts`（新）：`buildPreviewSrcdoc(body, zoom)` —— base target + zoom 样式统一注入；`injectBaseTarget` 从组件移入此处（helper 入 lib，ui-styling §10）。
  - `src/components/writing/HtmlPreview.tsx`：读 store `writingUIFontSize`，`useMemo` 生成 srcdoc。`WritingBoard` / `Briefing.tsx` 不动（−/+ 按钮在 HTML 预览态已可见）。

### 已知取舍

- 每次调字号 srcdoc 变化 → iframe 整体重载（脚本重跑、滚动位置回顶）。注入式方案无法避免；调字号低频，可接受。
- 不为"不重载"给 sandbox 加 `allow-same-origin`（等于给脚本开越狱通道）。

### 验收清单（追加）

- [ ] base 档打开 HTML 预览，视觉明显放大（zoom 1.2）
- [ ] 点 + / −，预览整体随之放大/缩小（文字、图片、布局等比），窄栏随档位变宽
- [ ] 自带内联样式的 HTML 缩放后不错位（zoom 是整页缩放而非样式覆盖）
- [ ] 链接点击仍走系统浏览器（base target 注入未被破坏）
- [ ] 错误分支（超 5MB / 读取失败）不受影响
- [ ] 单元：注入位置（有/无 `<head>`）、`!important` 存在、映射表 10 档齐全且 base=1.2
- [ ] E2E：点 + 后 iframe srcdoc 属性中的 zoom 值变化（srcdoc 在父 DOM 可读，无需穿透沙箱）
