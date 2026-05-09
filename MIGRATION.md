# 修缮原则 — 网页迁移友好

> **本文档的定位**：当前应用正处于「体验打磨」阶段。本文档不是迁移指南，而是**修缮阶段的编码原则**——告诉正在修 bug、调界面、改交互的 agent：**每一行代码怎么写，才能让未来从 Electron 迁移到网页版时更省力。**
>
> 每做一个改动前，问自己：「这个改动是绑死在 Electron 上的吗？网页版能做到同样的事吗？」

---

## 核心哲学：分层写代码

当前架构有两层：

| 层 | 内容 | 迁移时 |
|----|------|--------|
| **产品内核** | React 组件、页面、状态机、prompt 模板、纯逻辑函数、类型定义、样式 | ✅ 原封不动带走 |
| **平台 plumbing** | Electron 主进程、IPC、Node.js 文件系统、环境变量 | ❌ 必须重写 |

**你的任务是把产品内核打磨好，同时不加深 plumbing 的耦合。**

---

## DO（做了对未来迁移有帮助）

### 1. 新逻辑优先放在 `src/`，不是 `electron/`

新功能、新组件、新页面，默认放在 `src/` 下。`electron/` 目录只放"必须靠 Node.js 才能做到"的事。

- ✅ 新增一个设置面板 → `src/pages/Settings.tsx`
- ❌ 新增一个设置面板 → 在 `electron/ipc/` 里加一堆逻辑

**为什么**：`src/` 下的代码在网页端 100% 复用，`electron/` 下的代码 0% 复用。

### 2. 保持 `src/lib/ipc.ts` 是唯一接触面

渲染层和主进程的所有通信，必须经过 `src/lib/ipc.ts` 这个 facade。不要绕过它。

- ✅ 组件里调用 `ipc.scanLibrary()`
- ❌ 组件里直接 `window.api.scanLibrary()`
- ❌ 在 preload.ts 暴露新 API 却不在 `ipc.ts` 里声明

**为什么**：未来迁移时，只需替换 `ipc.ts` 这一个文件（把 IPC 调用换成 HTTP `fetch`），其他 20+ 个调用点完全不用动。

### 3. 纯逻辑放到 `src/lib/`，不要留在 `electron/lib/`

如果一段逻辑不依赖 `fs`、`path`、`os`、`undici` 等 Node.js API，把它移到 `src/lib/`。

可移动的现成例子：
- `electron/lib/archive.ts` — 标题冲突解决、复习附录格式
- `electron/lib/recommend.ts` — 推荐卡筛选算法
- `electron/lib/frontmatter.ts` — gray-matter 解析
- `electron/lib/prompts.ts` — prompt 装配链

**为什么**：这些是纯函数，零平台依赖。放在 `src/lib/` 里，网页端直接复用。留在 `electron/lib/` 里，迁移时还要再搬一次。

### 4. Prompt 模板保持纯文本文件

prompt 内容继续放在 `electron/prompts/*.md` 里，不要硬编码进 TypeScript。

- ✅ `fetch('/prompts/learner-base.md')` 或 `import` 读取
- ❌ 把 140 行 prompt 直接写进 `prompts.ts` 的字符串里

**为什么**：纯文本文件在网页端可以通过 `fetch` 或 `import` 读取。硬编码进 TS 虽然也能用，但失去了可维护性。

### 5. 状态管理远离 IPC 副作用

Zustand store（`src/store/index.ts`）应该只关心"业务状态"——session 走到哪一步、当前页面是什么、推荐卡怎么算。

IPC 调用是副作用，应该放在 store action 的**最外层**，不要嵌套在状态推导逻辑里。

```ts
// ✅ 好的：状态推导是纯的，IPC 在 action 边界
const recommendations = pickRecommendations(files)  // 纯逻辑
setRecommendations(recommendations)                   // 更新状态
ipc.patchState({ recommendation_cache: recommendations })  // 副作用在外层

// ❌ 坏的：IPC 嵌套在推导里
const recs = await ipc.scanLibrary().then(files => {   // 副作用在推导链里
  return pickRecommendations(files)
})
```

**为什么**：store 的结构和推导逻辑是产品内核，可以复用。IPC 调用是 plumbing，需要替换。

### 6. 错误兜底分层

- **渲染层错误**（网络超时、LLM 返回异常、用户输入无效）→ 在 `src/` 里处理，用 Toast、重试按钮、提示文案
- **主进程错误**（文件写入失败、磁盘满、权限不足）→ 在 `electron/ipc/` 里处理，返回错误码给渲染层

不要把"显示 toast"的逻辑放到主进程。主进程只负责"发生了什么事"，渲染层负责"怎么告诉用户"。

**为什么**：渲染层的错误 UI（toast、重试、加载状态）在网页端完全复用。主进程的错误处理需要重建。

---

## DON'T（做了会让未来迁移更痛苦）

### 1. 不要在组件或 `src/lib/` 里引入 Node.js API

- ❌ `import fs from 'node:fs'` 出现在 `src/` 下任何文件里
- ❌ `import path from 'node:path'` 出现在 `src/` 下任何文件里
- ✅ 需要文件操作 → 通过 `ipc.*` 调用主进程
- ✅ 需要路径处理 → 用简单的字符串拼接，或把逻辑放在 `electron/lib/`

**后果**：一旦 `src/` 里出现 Node.js API，网页版直接跑不起来，必须逐行清理。

### 2. 不要新建 IPC 通道而不更新 facade

如果在 `electron/preload.ts` 里暴露了新方法，必须在 `src/lib/ipc.ts` 里同步声明。不要直接在组件里 `window.api.newMethod()`。

**后果**：未来替换 `ipc.ts` 时，散落在 20 个组件里的 `window.api.xxx` 调用会变成漏网之鱼。

### 3. 不要把业务逻辑塞进主进程

主进程（`electron/ipc/*.ts`）应该只做一件事：**IO 中转**。

- ❌ 在 `electron/ipc/files.ts` 里做推荐算法筛选
- ❌ 在 `electron/ipc/llm.ts` 里做 prompt 装配
- ✅ 主进程：读文件 → 返回原始内容
- ✅ 渲染层：拿到内容 → 自己做筛选/装配

**后果**：业务逻辑进了主进程，迁移时要把逻辑"打捞"出来，很容易遗漏或出错。

### 4. 不要用文件系统存临时/UI 状态

- ❌ 用 `.json` 文件存"当前展开的侧边栏"
- ❌ 用 `.json` 文件存"用户上次选的难度"
- ✅ UI 状态用 Zustand（内存）
- ✅ 需要持久化的 UI 偏好 → `ipc.patchState()` → 未来平移到 localStorage

**为什么**：文件系统操作在网页端没有等价物。Zustand + localStorage 是网页端的常态。

### 5. 不要硬编码平台相关路径

- ❌ `c:\Users\86468\Desktop\...` 出现在代码里
- ✅ 通过 `.env` 或配置注入（当前已做到，保持即可）

---

## 文件安全区地图

修缮时打开一个文件，先看它在哪：

| 目录 | 安全程度 | 能做什么 | 不能做什么 |
|------|---------|---------|-----------|
| `src/pages/` | 🟢 100% 安全 | 放心改页面逻辑、路由、状态 | 引入 Node.js API |
| `src/components/` | 🟢 100% 安全 | 放心改 UI、交互、动画 | 引入 Node.js API |
| `src/styles/` | 🟢 100% 安全 | 放心改颜色、布局、动画 | — |
| `src/store/` | 🟡 注意安全 | 改状态结构、业务逻辑 | 引入 IPC 以外的 Electron 依赖；把副作用嵌进推导里 |
| `src/lib/` | 🟡 注意安全 | 改纯逻辑、工具函数 | 引入 Node.js API |
| `src/types/` | 🟢 100% 安全 | 放心改类型、加字段 | — |
| `electron/prompts/*.md` | 🟢 安全 | 改 prompt 内容 | — |
| `electron/lib/archive.ts` | 🟢 可移到 src/ | 改业务逻辑 | 引入 Node.js API |
| `electron/lib/recommend.ts` | 🟢 可移到 src/ | 改业务逻辑 | 引入 Node.js API |
| `electron/lib/frontmatter.ts` | 🟢 可移到 src/ | 改解析逻辑 | 引入 Node.js API |
| `electron/lib/prompts.ts` | 🟢 可移到 src/ | 改装配逻辑 | 引入 Node.js API |
| `electron/lib/llm-tasks.ts` | 🟡 注意安全 | 改任务逻辑 | 新增 Node.js 依赖 |
| `electron/lib/kimi.ts` | 🔴 禁区 | 只改 URL/参数 | 新增 Node.js 模块；改 SSE 解析逻辑（`parseSseChunk` 可复用，不要动） |
| `electron/ipc/*.ts` | 🔴 禁区 | 尽量不改；如必须改，只改错误处理/返回值 | 新增业务逻辑；新增 IPC 通道不更新 facade |
| `electron/preload.ts` | 🔴 禁区 | 尽量不改 | 暴露新的 `window.api` 方法 |
| `electron/main.ts` | 🔴 禁区 | 不改 | — |
| `electron/env.ts` | 🔴 禁区 | 不改 | — |

---

## 具体场景：怎么改才正确

### 场景 A：新增一个功能（例如「会话中途自动保存」）

**v2 规划中有的功能，修缮阶段可能提前做。**

❌ 错误做法：
- 在 `electron/ipc/` 里新增一个 `autoSave.ts`
- 主进程每 30 秒写一次文件
- 组件完全不感知

✅ 正确做法：
- 在 `src/store/index.ts` 的 session action 里，每次 `patchState` 时把 session history 一起带上
- 渲染层自己决定"什么时候值得保存"
- 主进程只提供一个 `ipc.patchState({ session_history: [...] })` 接口（已存在）
- 保存策略（频率、触发条件）是产品逻辑，放在 `src/` 里

### 场景 B：调整 LLM 调用行为（例如加一个新的 system prompt 变体）

❌ 错误做法：
- 在 `electron/ipc/llm.ts` 里根据条件拼接 prompt

✅ 正确做法：
- 在 `electron/lib/prompts.ts` 里改装配逻辑（或更理想：把它移到 `src/lib/prompts.ts`）
- `electron/ipc/llm.ts` 只管「收到参数 → 发请求 → 返回流」
- 业务判断（什么时候用什么 prompt）放在渲染层

### 场景 C：新增一个 UI 交互（例如 Study 页面加一个「导出对话」按钮）

❌ 错误做法：
- 按钮点击直接调 `ipcRenderer.invoke('files:export', ...)`
- 在 `electron/ipc/files.ts` 里新增 `export` handler 做格式化

✅ 正确做法：
- 格式化逻辑（把 Message[] 转成 Markdown 字符串）放在 `src/lib/export.ts`
- 按钮点击 → 调用格式化函数 → 拿到字符串 → `ipc.writeProgressMd(...)` 或下载
- 主进程只负责"把字符串写到某处"，不负责"怎么格式化"

### 场景 D：新增数据持久化需求（例如「记录用户点击了几次灵感 chip」）

❌ 错误做法：
- 新建一个 `~/.studyparlor/analytics.json`，主进程读写

✅ 正确做法：
- 问自己："网页版怎么实现这个？"
- 如果答案是 localStorage → 现在就按 localStorage 的接口设计（把数据塞到 `state.json` 的一个字段里，`ipc.patchState` 即可）
- 如果答案是后端 API → 保持当前 IPC facade 模式，数据结构和字段名保持一致

---

## 一句话总结

> **产品逻辑往 `src/` 走，IO 操作往 `electron/` 走。中间用 `src/lib/ipc.ts` facade 隔开。未来替换 facade，产品纹丝不动。**
