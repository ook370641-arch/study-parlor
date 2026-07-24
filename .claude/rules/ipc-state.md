---
description: "Use when adding IPC handlers, state fields, frontmatter schemas, or DocTypes."
paths:
  - "src/types/**"
  - "src/store/**"
  - "src/lib/ipc.ts"
  - "electron/ipc/**"
  - "electron/preload.ts"
  - "electron/lib/frontmatter.ts"
  - "electron/lib/app-paths.ts"
---

# IPC / 状态规则

## 1. 新增 IPC 接口必须同步四个层

**Why:** 漏改 preload 会导致运行时 `window.api.xxx is not a function`，即使 TypeScript 通过。

- 按顺序更新：types → main handler → preload → facade → store → 组件/测试。
- 每个新增 IPC 至少有一个启动探测或测试断言验证 `window.api` 上存在。
- 返回结构体使用显式 `{ ok: true; ... } | { ok: false; code; message }` 或类型化错误码，不裸抛错。
- Source: ipc-state.md §1

## 2. IPC 错误码必须在三层同步定义

**Why:** 错误消息经 Electron IPC 包装后，子串匹配会随前缀变化失效。

- 在 `src/types/index.ts` 中定义错误码联合类型。
- preload 层不做额外包装，保持错误 message 稳定。
- store 使用类型化错误码映射，而不是字符串 `includes`。
- Source: ipc-state.md §2

## 3. 新增持久化字段必须提供默认值并兼容旧 state.json

**Why:** 旧用户启动时缺少新字段，不处理会导致白屏或类型错误。

- 新字段在 `state.ts` 的 `DEFAULT` 和 store 的 `init` 中都要有默认值。
- 读取旧缓存或旧 state 时显式处理缺失字段，不使用 `as` 断言绕过。
- Source: ipc-state.md §3

## 4. 个性化设置全局统一持久化

**Why:** 同一概念复制成多个 state key 会让用户设置无法跨页面共享。

- 复用已有的字号枚举与常量（如 `BriefingFontSize`）。
- 不要把同一概念复制成多个 state key；避免 `fontSize` / `briefingFontSize` / `readerFontSize` 同时存在。
- Source: ipc-state.md §4

## 5. 渲染进程禁止直接 import 主进程解析库

**Why:** 主进程可用的库（如 `gray-matter`）在 Renderer 中可能因 `Buffer` 等 Node 内置对象报错。

- Renderer 侧只使用不依赖 Node 内置对象的纯 JS 实现。
- 若必须与主进程共享解析逻辑，通过 IPC 或 Preload 暴露，不要直接 import `electron/lib/` 下文件。
- Source: ipc-state.md §5

## 6. Frontmatter 持久化字段必须完整出现在共享类型中

**Why:** `Record<string, unknown>` 会架空类型检查，导致“写得出但类型不知道”。

- 新增持久化字段时先更新共享 `Frontmatter` 类型（或按 `DocType` 拆分的 discriminated union），再更新序列化/解析函数。
- 禁止用 `Record<string, unknown>` 或 `any` 逃避类型。
- Source: ipc-state.md §6

## 7. 文件名推断与 frontmatter type 必须对称完整

**Why:** 只改解析/扫描路径而忘记渲染侧映射，会导致新类型渲染异常。

- `DocType` 枚举、`inferDocTypeFromFilename`、`detectDocType`、`ReportHeader` 的 TYPE_LABELS/BADGE_STYLES 四者同步更新。
- 旧值映射显式写进 parse 函数（如 `difficulty = data.difficulty === 'medium' ? 'mid' : ...`）。
- Source: ipc-state.md §7

## 8. 扫描元数据优先读取 frontmatter type

**Why:** 硬编码中文文件名在用户改名或多语言场景下会误判。

- 扫描时读取 `.md` 的 frontmatter `type` 字段作为首要判定依据。
- 文件名匹配仅作为无 frontmatter 旧文件的兜底。
- Source: ipc-state.md §8

## 9. EXT_FIELDS 只列实际写入的字段

**Why:** 把从正文解析的字段混进 frontmatter schema 会让 reader 误以为它们存在于 frontmatter。

- `EXT_FIELDS` 只列出该类型 `serializeFrontmatter` 实际会写入的字段。
- 从正文解析的字段通过独立 parser 返回，不在 frontmatter 类型里占位。
- Source: ipc-state.md §9

## 10. 正文提取必须有单一权威路径

**Why:** 多个 parser 取“最短结果”的启发式不可解释、容易在不同边界下不一致。

- 只保留一种与 Renderer 环境兼容的 frontmatter strip/parser。
- parser 失败时报错或使用安全 fallback（如直接显示 raw content），不在多个输出中取最短。
- Source: ipc-state.md §10

## 11. 新增 DocType 必须完成全链路同步

**Why:** 只做最小 IO 实现会漏掉渲染、扫描、类型侧，导致新类型展示不完整。

- 改动清单：类型枚举 → 序列化扩展字段 → 文件名推断 → 渲染类型映射 → ReportHeader 差异化展示 → 扫描识别逻辑 → 测试覆盖。
- Source: ipc-state.md §11

## 12. 推荐缓存失效必须数据驱动

**Why:** 只看 `generatedAt` 会让旧格式缓存与新 UI 混存，显示空字段。

- 缓存条目携带数据版本或校验字段（如 `sessionCount`、schema version）。
- 格式变更时把旧条目标记为失效，强制重新生成。
- 缓存更新触发点绑定真实数据事件（归档成功、删除 session、删除 topic）。
- Source: ipc-state.md §12

## Example: cross-layer IPC change

- ❌ 只改 `electron/ipc/llm.ts`，未在 `electron/preload.ts` 暴露，渲染进程调用时报 `window.api.llmStart is not a function`。
- ✅ 按 types → handler → preload → facade → store → test 顺序同步，并加一个启动断言验证暴露。
