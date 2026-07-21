# 写作功能完善 & E2E 全覆盖设计

**日期**: 2026-07-22
**状态**: 已批准
**来源**: 写作功能 E2E 覆盖审计 (`2026-07-22` 审计报告)

## 动机

对夜航简报-写作功能做了一次全面 E2E 覆盖审计，发现三类缺口：

1. **功能缺口**：代码中不存在的 UI / 保护逻辑
2. **E2E 测试缺口**：代码已有但零测试覆盖的路径
3. **Mock 缺口**：E2E mock 太简单，无法支持错误态/reasoning/多轮等场景

本轮设计目标：补功能 → 增强 mock → 补 E2E，实现写作功能的全链路覆盖。

---

## 一、功能实现

### F1：写作助手错误态 UI + 重试

**现状**：`writingAssistant.error` 正确存储（store L1423），但 `WritingAssistantPanel.tsx` 和 `WritingAssistantMessages.tsx` 完全不渲染 error 字段。用户看到的只是消息区静默卡住。

**方案**：在 `WritingAssistantMessages.tsx` 底部（streaming 指示器上方）增加错误提示，参照 `ChatWindow.tsx:136-146` 已有模式：

```tsx
{showError && (
  <div className="text-xs text-ember/80">
    回复失败
    <button
      className="ml-2 underline hover:text-ember"
      onClick={() => retryWritingAssistantMessage()}
    >
      重试
    </button>
  </div>
)}
```

**触发条件**：`error` 非空、`!streaming`、最后一条 assistant 消息内容为空（区别于部分成功的流式）。

**Store 新增**：`retryWritingAssistantMessage` action — 移除最后一条空 assistant 消息 + 取出最后一条 user 消息的 content → 调用 `sendWritingAssistantMessage(text)`。

**边界**：
- 流式进行中不显示错误（`streaming=true` 优先）
- 点击重试 → 移除最后一条空 assistant 消息 → 重新发送最后一条 user 消息
- 重试再次失败 → 错误提示持续显示

### F2：空文章保护

**现状**：`writingFile === null` 时，`sendWritingAssistantMessage` 传 `articleContent: ''`，无拦截。

**方案**：`WritingAssistantInput.tsx` 中增加判断：
- `writingFile === null` → 输入框 `disabled`，placeholder 变为"请先选择或新建一篇文章"
- 发送按钮同样 disabled
- 纯 UI 层拦截，不涉及 store/IPC 变更

### F3：Catalog 摘要 Hover Tooltip

**现状**：AI 自动生成的短摘要只存在于 `.catalog.json` 和 system prompt 中，用户无可见出口。

**设计**：参照 `AnthropicArticleRow.tsx` 的 hover 展开模式（`line-clamp-1` → hover 移除 clamp），文件树节点在 hover 时垂直展开显示摘要：

```
常态：
  · 七月夜话.md

Hover：
  · 七月夜话.md
    关于七月的随笔，记录了夏夜的思绪……  ← 10px, parchment/50, line-clamp-2
    2026-07-19                              ← 10px, parchment/30
```

**数据流**：
1. `WritingTreeNode` 类型新增可选字段 `summary?: string`、`catalogUpdatedAt?: string`
2. `scanDir()` 构建文件节点时，查 `loadCatalog(lib, root).entries[relPath]`，附加 summary
3. `WritingTree.tsx` 节点渲染增加 hover 展开逻辑（`useState` + `onMouseEnter/Leave`，与 AnthropicArticleRow 一致）

**不新增 IPC**：数据随 `writing:scanTree` 一并返回。

---

## 二、Mock 增强

E2E mock（`electron/ipc/writing-assistant.ts` 的 `isE2EMock()` 分支）新增三个能力：

### M1：错误注入

```ts
if (process.env.E2E_WRITING_ASSISTANT_ERROR) {
  const code = process.env.E2E_WRITING_ASSISTANT_ERROR
  send('llm:error', args.sessionId, { code, message: `E2E injected error: ${code}` })
  return
}
```

支持的注入值：`CHAT_NETWORK_ERROR`、`CHAT_TIMEOUT`、`CHAT_LLM_ERROR`

### M2：Reasoning chunk

```ts
if (process.env.E2E_WRITING_ASSISTANT_REASONING === '1') {
  send('writingAssistant:reasoningChunk', args.sessionId, '先梳理文章结构……')
}
```

默认关闭（保持现有测试行为不变）。

### M3：多轮对话回显

Mock 读取 `args.messages`，在回复中引用最后一条 user 消息内容：

```ts
const lastUserMsg = args.messages.filter(m => m.role === 'user').at(-1)?.content ?? ''
// 回复中加入 "关于「...」的分析："
```

使多轮测试可以断言 assistant 回复确实引用了用户问题。

---

## 三、E2E 测试补充（15 条）

### `writing-tree.spec.ts` +2

| 用例 | 覆盖 |
|---|---|
| **拖拽移动文件** | drag 文件节点到目录节点 → 断言磁盘位置变化 + 树中不再有旧路径 + 新位置出现 |
| **文件节点 hover 显示摘要** | hover 文件节点 → 断言 summary 文本出现、日期出现 |

### `writing-editor.spec.ts` +3

| 用例 | 覆盖 |
|---|---|
| **AI Insert-to-editor** | 选文章 → 发 AI 消息 → 等 streaming 完成 → 点"插入到编辑器 ▸" → 断言编辑器内容含插入文本 |
| **保存失败 UI** | 模拟写盘失败（或直接用 IPC mock） → 断言"保存失败"红色文字 + `saving: 'error'` |
| **Ctrl+S 触发 catalog 更新** | 编辑保存 → poll `.catalog.json` 对应条目 summary 非空 |

### `writing-assistant.spec.ts` +2

| 用例 | 覆盖 |
|---|---|
| **多轮对话** | 发 3 条不同消息 → 断言 6 条消息（3 user + 3 assistant）+ assistant 回复分别引用用户问题 |
| **空文章保护** | 不选文章 → 断言输入框 disabled + placeholder 含"请先选择" |

### `writing-assistant-tools.spec.ts` +2

| 用例 | 覆盖 |
|---|---|
| **ArticleContent 传递** | 编辑内容 "E2E测试文章正文" → 发消息 → 读 `last-writing-request.json` → 断言 `articleContent` 含该文本 |
| **Tool 事件文本可见** | 发消息 → 断言消息区含 `> 读取：` 和 `> 来源：[read_local]` 文本 |

### `writing-assistant-search-thinking.spec.ts` +1

| 用例 | 覆盖 |
|---|---|
| **Reasoning 块展示** | `extraEnv: { E2E_WRITING_ASSISTANT_REASONING: '1' }` → 断言 `details` reasoning 块可见 + 含思考文本 |

### 新建 `writing-assistant-error.spec.ts` +1

| 用例 | 覆盖 |
|---|---|
| **错误态 → 重试 → 成功** | 注入 `E2E_WRITING_ASSISTANT_ERROR=CHAT_NETWORK_ERROR` → 断言"回复失败"+"重试"→ 点重试（不注入错误）→ 断言回复正常 |

### `writing-repository.spec.ts` +3（含修复 skip）

| 用例 | 覆盖 |
|---|---|
| **Repo 文件打开阅读** | Seed 带 `type: writing` frontmatter 的 repo 文件 → 点文件 → 断言编辑器可见 + 内容正确（修复原 skip） |
| **Repo 文件编辑保存** | 打开 repo 文件 → 编辑内容 → 断言保存成功 + 磁盘内容变化 |
| **导入实际文件** | Seed 外部 .md → 点导入按钮 → dialog 选文件 → 断言树中出现新文件 + catalog 条目 |

### 新建 `writing-assistant-resize.spec.ts` +1

| 用例 | 覆盖 |
|---|---|
| **写作助手面板 resize** | 拖 resize handle 向左 → 断言面板宽度增大 |

---

## 四、实现顺序

```
Phase 1: 功能实现
  ├── F1: WritingAssistantMessages 错误 UI + retry
  ├── F2: WritingAssistantInput 空文章保护
  └── F3: WritingTreeNode +summary, scanDir 读 catalog, WritingTree hover 展开

Phase 2: Mock 增强
  ├── M1: 错误注入
  ├── M2: Reasoning chunk
  └── M3: 多轮回显

Phase 3: E2E 补充
  ├── writing-tree.spec.ts (+2)
  ├── writing-editor.spec.ts (+3)
  ├── writing-assistant.spec.ts (+2)
  ├── writing-assistant-tools.spec.ts (+2)
  ├── writing-assistant-search-thinking.spec.ts (+1)
  ├── writing-assistant-error.spec.ts (new, +1)
  ├── writing-repository.spec.ts (+3)
  └── writing-assistant-resize.spec.ts (new, +1)
```

---

## 五、风险与约束

- **Catalog 摘要为空**：新文件保存后 LLM 摘要生成是异步的，hover 时可能暂无摘要 → 仅在有 summary 时展开，无摘要的节点 hover 无变化
- **Repo 文件打开 skip**：原 skip 的原因是 `selectWritingFile` 对无 frontmatter 的文件行为不确定。修复方案是 seed 带 `type: writing` frontmatter 的文件
- **保存失败模拟**：Electron 环境下写本地文件极少失败。可通过 mock IPC `writing:write` 返回 error 来触发，或接受此用例的低优先级
- **拖拽 E2E**：Playwright 的 `dragTo` 可能在 Electron 环境下不稳定，备选用 `evaluate` 直接调 `ipc.writingMove`
