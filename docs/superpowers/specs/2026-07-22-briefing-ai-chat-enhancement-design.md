# 夜航简报 AI 对话体验增强

**日期：** 2026-07-22
**状态：** 设计完成
**范围：** 旁注聊天、写作助手、求职日报、写作全流程、E2E 覆盖

---

## 概述

夜航简报的 AI 对话功能（旁注聊天、写作助手）经过多轮迭代已形成两条独立的实现链路。本次迭代聚焦三个维度：

1. **修关键 bug**：写作助手会话不保存导致数据丢失
2. **补功能对称**：仓库建分组、digest 标注、标注注入聊天、chunk buffering
3. **补 E2E 盲区**：求职背景注入、文章上下文、markdown 渲染、损坏恢复、全流程串联

---

## 功能改动

### P0-1 写作助手会话自动保存（bug 修复）

**问题：** `finishWritingAssistantStreaming()` 只设 `streaming: false`，不写 `.assistant.md`。用户聊天内容在切换文章/关闭面板/重启后永久丢失。

**改动：**

1. `src/store/index.ts`：新增 `saveWritingAssistantSession()` action
   - 读取 `writingAssistant.messages`，调 `ipc.articleAssistantWriteSession({ parentPath: articlePath, parentType: 'writing', messages })`
   - IPC 已存在（`electron/ipc/article-assistant.ts`），无需新增

2. `finishWritingAssistantStreaming()` 末尾调 `saveWritingAssistantSession()`

3. `setWritingAssistantOpen(false)` 时若 `messages.length > 0` 触发保存

4. E2E `writing-assistant.spec.ts`：新增用例
   - 选中文章 → 发消息 → 等待回复 → 切到另一篇文章 → 切回来 → 重新 `loadWritingAssistantSession` → 断言消息恢复（非 seed，真实新对话）

---

### P0-2 仓库（Repository）新建分组

**问题：** `createFolder()` 主进程支持 `root: 'repository'`，但 UI 右键菜单对 repo tab 不显示"新建子分组"。

**改动：**

1. `src/components/writing/WritingTree.tsx`：repo tab 上下文菜单加"新建子分组"项
   - 调用 `createFolder({ root: 'repository', parentDir, name })`

2. E2E `writing-repository.spec.ts`：新增用例
   - 切换到 repo tab → 右键目录节点 → 新建子分组 → 输入名称 → 确认 → 验证磁盘目录存在 → 验证树中出现

---

### P0-3 求职背景注入验证（E2E mock 增强）

**问题：** E2E mock 跳过 LLM 调用，不经过 prompt 构建，无法验证用户填写的求职档案是否实际注入到请求中。

**改动：**

1. `electron/ipc/job-briefing.ts`：E2E mock 路径增强
   - 在返回 mock 结果前，调 `buildJobBriefingPrompt()` 获取完整 prompt
   - 将请求体写入 `E2E_CONFIG_DIR/last-job-request.json`（与写作助手的 `last-writing-request.json` 同模式）

2. E2E `job-briefing-generation.spec.ts`：新增用例
   - settings 填 profile → 生成求职简报 → 读 `last-job-request.json` → 断言 system/content 包含 profile 字段（targetRoles、direction、experience 等）

---

### P0-4 Digest 文章标注

**问题：** `ArticleAnnotations` 只在 `AnthropicArticleReader.tsx` 挂载。digest 简报路径（`Briefing.tsx`）有旁注聊天但没有划线标注功能。

**改动：**

1. `src/pages/Briefing.tsx`：digest 阅读器区域挂载 `ArticleAnnotations`
   - 传入 `articlePath`（digest `.md` 路径）
   - `.annotations.md` 写入 `夜航简报/` 目录，格式与 Anthropic 文章一致

2. E2E `article-annotations.spec.ts`：新增用例
   - 打开 digest → 选中正文 → 触发幽灵笔 → 写备注 → 保存 → 验证 `夜航简报/` 下 `.annotations.md` 写入

---

### P1-2 写作助手 chunk buffering

**问题：** 旁注聊天有 50ms 批量 flush（`assistant-stream-buffers.ts`），写作助手每个 chunk 直接更新 store，长回复时造成不必要的重渲。

**改动：**

1. `src/lib/writing-assistant-runtime.ts`：引入 chunk buffering
   - 复用 `assistant-stream-buffers.ts` 的 `ContentBuffer`（或抽取共享）
   - content chunk 累积 50ms 后批量调 `appendWritingAssistantChunk`
   - reasoning chunk 同理

2. 无独立 E2E。已有 `writing-assistant.spec.ts` 多轮对话测试验证功能不退化。

---

### P1-3 标注注入旁注聊天上下文

**问题：** 用户在文章上的标注（划线 + 备注）是用户主动输入的知识，但旁注聊天的 AI 完全不知道标注内容。AI 只能看到文章原文和当前选段。

**改动：**

1. `electron/lib/article-assistant-prompt.ts`：`buildAssistantUserPrompt()` 加 `annotations?: ArticleAnnotation[]` 参数
   - 若 annotations 非空，生成"用户的标注："段，列出每条标注的选中文字 + 备注 + 段落位置

2. store `sendAssistantMessage`：在调用 IPC 前读取 `.annotations.md` → 传入 annotations

3. IPC `articleAssistant:sendMessage`：接收 `annotations` 参数，传入 `buildAssistantUserPrompt`

4. E2E `article-assistant-controls.spec.ts`：新增用例
   - 打开文章 → 创建标注 → 打开旁注聊天 → 发消息 → 读 `last-assistant-request.json` → 断言 user prompt 含标注内容

---

## E2E 盲区补齐

### E4 旁注聊天文章上下文注入验证

旁注聊天发送消息时，文章正文应包含在请求上下文中。写作助手已有等价测试（`writing-assistant-tools.spec.ts` ArticleContent 传递），旁注缺少。

**E2E：** 打开 digest → 旁注聊天 → 发消息 → 读 `last-assistant-request.json` → 断言 user prompt 含文章正文片段

### E5 写作全流程串联

当前各步骤独立测试（创建、编辑、聊天、插入、保存），缺少一条覆盖完整用户路径的端到端用例。

**E2E：**
1. 空库 → 新建文章 "全流程测试"
2. 编辑器输入 "# 开头\n\n第一段内容"
3. 等待自动保存 → 验证"已保存"
4. 打开 AI 助手 → 发送 "扩写第一段"
5. 等待回复 → 点击"插入到编辑器"
6. 验证编辑器含插入内容
7. Ctrl+S → 验证"已保存"
8. `window.reload()` → 导航回写作 → 选中 "全流程测试"
9. 验证编辑器内容完整（原始 + 插入）
10. 打开 AI 助手 → 验证对话历史恢复（`.assistant.md` 持久化）

### E6 聊天 Markdown 渲染

两个聊天系统都渲染 LLM 返回的 markdown，但无测试验证富文本（粗体、代码、列表、链接）正确渲染。

**E2E：** mock 返回含 `**粗体**`、`` `code` ``、`- 列表`、`[链接](url)` → 验证渲染结果（DOM 含对应元素）

### E7 `.assistant.md` 损坏恢复

`.assistant.md` 可能在磁盘 I/O 中损坏（如写入中断）。需要降级行为：文件损坏时不白屏，给出可恢复状态。

**E2E：** 手动写入 malformed frontmatter 到 `.assistant.md` → 打开文章聊天 → 验证不白屏 → 验证有降级提示或自动重置为空对话

---

## 模块共通化评估（设计附录）

两个聊天系统当前仅共享底层 `kimi.ts` LLM 客户端。其余全部独立实现。

### 可提取共享基元（不入本次实施）

| 基元 | 提取自 | 复用场景 |
|---|---|---|
| `ReasoningBlock` | 两处相同 JSX | `<details>` 折叠思考过程 |
| `StreamingIndicator` | 两处相同 JSX | "思考中…" 动画 |
| `SourceChip` | 写作助手 | 工具来源标签，旁注搜索来源 |

### 应保持独立

| 组件 | 理由 |
|---|---|
| 布局容器 | 浮动窗口（旁注）vs 停靠面板（写作助手），UX 差异是功能需求 |
| 消息数据类型 | `ArticleAssistantMessage.selection` vs `WritingAssistantMessage.sources` |
| 输入区域 | 行内 `<input>`（旁注）vs `<textarea>`（写作助手） |

### 功能对称性（后续独立迭代）

- 写作助手 → 旁注：`read_local` 工具能力
- 旁注 → 写作助手：chunk buffering（P1-2 已纳入）

---

## 不纳入本次迭代

| 项目 | 理由 |
|---|---|
| 写作助手苏格拉底模式 | 用户评估优先级不高 |
| 对话历史全局浏览器 | 用户不需要独立入口，对话跟随文章即可 |
| 长对话截断测试 | DeepSeek 上下文窗口足够，无需截断 |
| 聊天组件完全统一重构 | 布局差异大，收益/风险比低 |
| 标注的跨文章搜索/聚合 | 需求未明确，需要用户反馈 |

---

## 实施顺序

```
Phase 1（数据安全 + 关键缺口）:
  P0-1 写作助手会话保存
  P0-2 仓库新建分组
  P0-3 求职背景注入验证

Phase 2（功能对称 + 覆盖补齐）:
  P0-4 Digest 文章标注
  P1-2 Chunk buffering
  P1-3 标注注入聊天上下文
  E5   写作全流程串联

Phase 3（盲区补齐）:
  E4 旁注聊天文章上下文
  E6 聊天 Markdown 渲染
  E7 .assistant.md 损坏恢复
```

---

## 变更影响面

| 文件 | Phase | 改动类型 |
|---|---|---|
| `src/store/index.ts` | P1 | 新增 `saveWritingAssistantSession`，修改 `finishWritingAssistantStreaming`、`setWritingAssistantOpen` |
| `src/components/writing/WritingTree.tsx` | P1 | repo tab 右键菜单加"新建子分组" |
| `electron/ipc/job-briefing.ts` | P1 | E2E mock 路径写 `last-job-request.json` |
| `src/pages/Briefing.tsx` | P2 | digest 路径挂载 `ArticleAnnotations` |
| `src/lib/writing-assistant-runtime.ts` | P2 | 引入 chunk buffering |
| `electron/lib/article-assistant-prompt.ts` | P2 | `buildAssistantUserPrompt` 加 `annotations` 参数 |
| `electron/ipc/article-assistant.ts` | P2 | `sendMessage` handler 接收 `annotations` |
| `e2e/specs/writing-assistant.spec.ts` | P1 | P0-1 会话恢复用例 |
| `e2e/specs/writing-repository.spec.ts` | P1 | P0-2 新建分组用例 |
| `e2e/specs/job-briefing-generation.spec.ts` | P1 | P0-3 求职背景注入用例 |
| `e2e/specs/article-annotations.spec.ts` | P2 | P0-4 digest 标注用例 |
| `e2e/specs/article-assistant-controls.spec.ts` | P2 | P1-3 标注注入用例 |
| `e2e/specs/writing-editor.spec.ts` | P2 | E5 串联流程用例 |
| `e2e/specs/article-assistant.spec.ts` | P3 | E4 上下文注入、E6 markdown、E7 损坏恢复 |
