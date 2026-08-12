# 写作仓库放置与阅读 xlsx / pdf / docx（统一 markdown 预览）

- 日期：2026-08-12
- 状态：已批准（方案 A，三种格式全做）

## 背景与目标

写作库（`writing/` + `repository/`）目前只接受 `.md`：`scanDir` 忽略非 md 文件，导入对话框只过滤 md。用户希望把 xlsx/pdf/docx 放进仓库并能阅读——包括**用户应用内预览**与**写作助手 read_local 引用**两种阅读对象，放置方式与 md 一致（导入对话框 + 系统拖拽）。

可行性 spike 已在项目 Electron 30（Node 20.15）运行时实测通过：
- xlsx：`exceljs`（MIT）读取 ✓
- docx：`mammoth`（BSD）→ HTML → turndown → markdown ✓
- pdf：`pdfjs-dist@4.10.38`（Apache，**必须锁 4.x**，最新 6.x 要求 Node ≥22.13 会崩）文本抽取 ✓

## 方案：统一 markdown 预览

主进程新增解析层 `file-preview.ts`，三种格式统一输出 markdown 字符串；渲染层检测非 md 文件后渲染只读 `MarkdownContent` 预览（复用现有组件），不挂 Milkdown 编辑器；助手 `read_local` 对非 md id 走同一解析层。

- ✅ 一条渲染路径、风格统一、改动最小
- ⚠️ xlsx 不可交互（纯表格预览）、pdf 丢版式——学习库场景够用；另有「用系统程序打开」兜底

### 依赖（全部纯 JS，无原生二进制）

```
exceljs@^4.4.0        # xlsx 解析（日期返回真实 Date，MIT）
mammoth@^1.12.1       # docx → HTML（BSD）
pdfjs-dist@4.10.38    # pdf 文本抽取（精确锁 4.x；legacy build + disableWorker）
```

- 渲染层复用 `src/components/md/MarkdownContent.tsx`（react-markdown + remark-gfm），**不加**渲染依赖
- 三类库只在主进程使用（electron-vite 主进程默认 externalize 依赖，不进 renderer 包）

## 架构

### 1. 放置：导入对话框

`writing:importFiles`（主进程）过滤器扩展为 `Markdown / Office 文档(xlsx,pdf,docx) / 所有文件`。md 走现有 `createFile`+copy；非 md 新增 `tree.importBinaryFile()` 按原名拷入（复用 `uniqueName` 防重名）。底层抽公共函数 `importPaths(targetRel, filePaths)`，对话框与拖拽共用。

### 2. 放置：系统拖拽

- preload 用 `webUtils.getPathForFile` 暴露 `getPathForFile(file)`（contextIsolation 下 renderer 拿不到 `File.path`）
- 树节点 `onDrop` 识别 `dataTransfer.files` → 逐文件拿路径 → `writing:importPaths`；拖到分组 = 进分组，拖到空白 = 进根
- 只接受 md/xlsx/pdf/docx；其它扩展名跳过并计数返回

### 3. 树扫描与渲染分支

- `writing-tree.ts` `scanDir` 接受 `.md/.xlsx/.pdf/.docx`；扩展名集合集中在 `@shared`（`NON_MD_EXTENSIONS` + `NonMdKind`），主进程与渲染层各引一处
- `selectWritingFile`（store）：非 md 走新 IPC `writing:readPreview`；`writingFile` 状态加 `kind: 'md' | 'xlsx' | 'pdf' | 'docx'` 与 `previewError?`/`truncated?`
- `WritingBoard` 分支：md → Milkdown（现状）；非 md → 只读预览组件（文件名 + 系统打开按钮 + MarkdownContent + 截断提示），隐藏保存状态/自动保存
- 树内重命名对非 md **保留原扩展名**（`normalizeWritingFileName` 加扩展名参数）；移动/删除/拖拽排序天然兼容（通用 fs 操作）

### 4. 解析层 `electron/lib/file-preview.ts`

```
previewFile(lib, rel) → { kind: NonMdKind; title: string; content: string; truncated: boolean }
```

- **xlsx**：exceljs → 每 sheet 一个 `## <名称>` 标题 + GFM 表格（上限 500 行 × 30 列 × 5 sheet，超限截断并注明）；日期格式化、`|`/换行转义
- **docx**：mammoth `convertToHtml` → 正则剥 `<img>`（避免 base64 膨胀）→ 正则提 `<table>`→GFM 标记占位 → turndown(其余 HTML) → 还原标记；截断 50KB
- **pdf**：pdfjs legacy build，`getDocument({ data, disableWorker: true, cMapUrl, standardFontDataUrl })`（cMapUrl 指向自带 `cmaps/`，中文 PDF 必需）→ 逐页 `getTextContent` → `---` 分隔 + `## 第 N 页`；上限 30 页；文本为空抛 `PDF_NO_TEXT`
- 解析失败抛类型化错误码 `PREVIEW_PARSE_ERROR` / `PDF_NO_TEXT`（加入 `WritingErrorCode` 联合）

### 5. 助手 `read_local`

`writing-assistant/tools.ts`：解析 id 指向的文件时先判扩展名——非 md → 走 `previewFile` 返回 markdown（带截断提示）；md → 现状。xlsx/pdf/docx 均可被写作助手引用分析。

### 6. 目录摘要与索引防护

- `refreshCatalog` 的 LLM 摘要循环**只处理 md**（扫描混入非 md 后必须过滤，否则 gray-matter 读二进制会炸）
- 非 md 也进 `.catalog.json`：摘要用**本地派生 stub**（xlsx：sheet 数+行数；docx/pdf：抽取文本前 80 字），带 mtime → 出现在助手「资料目录」可被引用，文件变更自动重算

### 7. IPC 契约（三层同步）

新增：
- `writing:readPreview` → `{ kind, title, content, truncated }` | `{ ok:false, code }`
- `writing:importPaths` → `{ imported: string[]; skipped: string[] }`
- `writing:openInSystem` → `shell.openPath`（`assertInsideRoots` 路径校验）
- preload：`getPathForFile`

按 types → handler → preload → facade → store → 组件 顺序同步。

## 错误处理与边界

- 损坏文件/解析失败 → `PREVIEW_PARSE_ERROR` → 渲染层本地化文案 + 「系统打开」兜底
- 扫描 PDF 无文本 → `PDF_NO_TEXT` → 提示 + 「系统打开」
- 文件被外部删除 → 树刷新降级，预览显示缺失提示（`fs.existsSync` 前置检查）
- 空文件、空 sheet、超大文件截断均有明确提示（`truncated` 标记 + 文案）
- 大文件上限：xlsx 500 行×30 列×5 sheet；docx 50KB；pdf 30 页

## 测试

- 单测：
  - `file-preview` 三种解析器：正常样本 / 空文件 / 损坏文件 / 截断 / 无文本 pdf
  - `writing-catalog`：非 md 不破坏 refreshCatalog、stub 摘要存在且带 mtime
  - `writing-tree-utils`：`normalizeWritingFileName` 对非 md 保留扩展名
  - 组件：WritingBoard 非 md 分支（预览渲染、隐藏保存状态、系统打开按钮）
- E2E（新 spec + `e2e/source-map.json` 更新）：
  - 导入 xlsx → 树显示 → 点开 → 表格预览
  - 导入 pdf → 文本预览或 `PDF_NO_TEXT` 降级路径
  - 助手 read_local 引用 xlsx（mock）
- 每处 UI 出口带 `data-testid` 并出现在至少一个 e2e 断言

## 验收清单

- [ ] 导入对话框可选 xlsx/pdf/docx，导入后树中显示
- [ ] 系统拖拽 xlsx/pdf/docx 进分组/根级生效
- [ ] 点击非 md 文件显示只读 markdown 预览（表格/文本），无 Milkdown、无保存状态
- [ ] 预览含「用系统程序打开」入口，损坏/无文本时提示明确
- [ ] 助手 read_local 能引用并返回解析后的 xlsx 表格内容
- [ ] refreshCatalog 不因非 md 崩溃，非 md 在助手资料目录可见
- [ ] 重命名非 md 保留扩展名
- [ ] 打包后可解析（pdfjs cmaps 走 app.getAppPath() 资源路径）
