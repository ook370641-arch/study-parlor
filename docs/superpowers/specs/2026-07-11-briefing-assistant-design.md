# 文章旁注助手设计

- 日期：2026-07-11
- 状态：待实现
- 范围：Briefing 文章与 Anthropic 博客文章

## 摘要

为 Briefing 与 Anthropic 博客文章增加一个可收起的“旁注”小助手。文章打开/生成时自动在右侧导读区生成背景、摘要与术语表；用户可选中文本，点击“旁注”竖条呼出小窗进行苏格拉底式问答；支持一键 Tavily 联网搜索后再回答；对话自动保存到对应文章目录。

## 目标

1. 降低阅读 Briefing/Anthropic 文章时的认知门槛。
2. 让用户对不懂的段落随时提问，无需复制粘贴。
3. 自动生成并展示术语表，帮助用户理解英文概念。
4. 复用现有 Tavily 搜索与苏格拉底对话提示词。

## 非目标

1. 不替代主应用的学习会话流程。
2. 不生成新的 `.md` 学习报告；旁注记录单独保存。
3. 不修改现有 briefing/anthropic 文章的正文结构。

## 用户流程

```
打开/生成文章
  → 右侧导读区自动展示：背景、分块摘要、术语表
  → 用户选中文字
      → “旁注”竖条出现徽标，提示已捕获上下文
      → 用户点击“旁注”竖条
          → 右下浮出小窗，显示“你选中了：XXX”
          → 用户输入问题，流式回复
          → 或点击 🔍，走 Tavily 搜索后再回答
  → 关闭文章/切换文章时自动保存旁注记录
```

## UI/UX 设计

### 默认状态

- 右侧导读面板展示自动生成的背景、摘要、术语。
- “旁注”竖条贴在导读面板左侧，小窗完全不可见。

### 呼出小窗

- 点击“旁注”竖条 → 小窗从右下侧展开，默认宽度 340px、高度 260px。
- 小窗可拖拽标题栏移动；四个角均显示 resize 抓手，可沿任意方向拉伸。
- 再次点击竖条或点击 × 关闭。

### 选中文本

- 选中任意文字后**不自动展开**小窗。
- 竖条上的“旁注”旁出现微弱徽标（ember 色），提示已捕获上下文。
- 展开小窗后看到引用块“你选中了：XXX”。
- 连续多次选中会**替换**当前引用块。

### 输入与回复

- 输入框在底部，placeholder 为“问点什么……”。
- 回复使用现有苏格拉底式教学提示词。
- 回复中若使用外部搜索，顶部显示“已搜索 N 个来源”。

### 联网搜索按钮

- 输入框左侧放置 🔍 按钮。
- 点击后将当前引用块 + 用户问题交给 Tavily 搜索。
- 搜索结果摘要整理为文本块后注入上下文，再由 LLM 回答。
- 搜索过程中按钮显示 spinner，不可重复点击。

## 内容生成策略

文章打开/生成时，调用一次非流式 LLM，产出右侧导读内容。

### 输入

- Briefing 文章：已生成的 markdown 正文。
- Anthropic 博客：`anthropic-scraper.ts` 转换后的 markdown。
- 可选：用户 profile、文章类型标记。

### 输出结构

```json
{
  "background": "string",
  "chunks": [
    {
      "heading": "string",
      "summary": "string",
      "terms": [
        { "term": "string", "translation": "string", "explanation": "string" }
      ]
    }
  ]
}
```

### 生成内容

1. **背景**：1-2 句，说明文章解决什么问题、面向谁。
2. **按 H2/H3 切分 chunk**：每 chunk 一段摘要，由 LLM 自行决定长度。
3. **术语表**：每 chunk 提取 0-3 个关键术语，给出中文翻译 + 2-3 句英文解释。
4. **术语高亮**：正文渲染时把这些术语用虚线下划线标出，hover 显示翻译。

### 复用能力

- LLM 调用走 `electron/lib/llm-tasks.ts` 的 `chatNonStream`。
- JSON 提取复用 `extractJsonObject`。
- 新增系统提示 `electron/prompts/digest-guide.md`，要求输出上述 JSON，语气为苏格拉底式教学。

### 缓存

- 导读内容生成后缓存在内存 store 中，不单独写文件。
- 重新生成/刷新文章时一并重算。

## 旁注对话与上下文模型

### 上下文组成

每次提问时，上下文包含：

1. **系统提示**：现有苏格拉底教学提示词 + 约束“正在陪用户读一篇文章”。
2. **全文摘要/背景**：自动生成的 `background` 与全部 chunk 摘要。
3. **选中引用**：当前“你选中了：XXX”。
4. **历史消息**：本次旁注会话的 QA 全量记录。

### 选中即上下文

- 用户选中文字后替换当前引用块；未选中任何文字时，引用块隐藏。
- 用户未输入问题直接发送时，助手根据引用块主动提问。
- 用户也可不选中文字，直接问关于整篇文章的问题。

### 联网搜索流程

1. 用户点击 🔍，按钮进入 loading。
2. 构造 Tavily query：`当前选中引用 + 用户输入问题`。
3. 调用现有 `searchWeb` / IPC `search:web`。
4. 使用全部返回结果，按模板整理为文本块：
   ```
   来源 1：{title}
   {content}
   链接：{url}
   ```
5. 将整理后的文本块注入上下文，由 LLM 流式回答。
6. 按钮恢复。

### 与会话系统的关系

- 旁注**不重用** `session-runtime.ts` 主会话，避免污染学习记录。
- 使用独立的轻量 `assistantSession` 状态，只存当前文章的旁注消息。
- 流式调用走同样的 `llm:start` / `llm:chunk` / `llm:done` IPC，session id 形如 `article-assistant-<timestamp>`。
- 提供停止按钮，可 abort 当前流式回复。

## 错误处理

### 导读生成失败

- JSON 解析失败或 schema 缺字段：降级为只显示原文背景，右侧导读区显示“未能生成导读，可继续阅读原文”。
- LLM 调用超时/abort：不阻塞页面，用户仍可手动打开旁注小窗提问。

### 对话失败

- `llm:start` 返回错误时，在小窗内以错误气泡显示，错误码映射为：
  - `NETWORK_ERROR` → “网络断开，请重试。”
  - `TIMEOUT` → “响应超时，请重试或缩短问题。”
  - `LLM_ERROR` → “模型暂时无法回答，请稍后再试。”
- 提供重试按钮，重新发送同一条消息。

### Tavily 搜索失败

- 复用现有 `SearchErrorCode`：`TAVILY_ERROR`、`NETWORK_ERROR`、`NO_RESULTS`、`MISSING_API_KEY`。
- `NO_RESULTS` 时小窗显示“未找到相关网络来源，仍基于文章内容回答”。
- 其他错误显示“搜索失败，仅基于文章内容回答”。

### 文件保存失败

- 写 `assistant-session.md` 失败时写入 `~/.studyparlor/recovery/article-assistant-<timestamp>.md`。
- UI 显示轻量提示“旁注记录已暂存到恢复目录”。

## 自动保存

### 保存时机

- 每次 LLM 回复完成后追加保存。
- 关闭小窗、切换文章、退出页面时幂等保存。

### 保存位置

- **Briefing 文章**：`~/.studyparlor/briefing-cache/<date>/assistant-session.md`
- **Anthropic 博客**：`<library>/anthropic/<slug>/assistant-session.md`

### 文件格式

新的 docType `article-assistant`，frontmatter 中的 `parent_path` 为对应文章文件的**绝对路径**：

```yaml
---
type: article-assistant
parent_path: string        # 对应文章文件的绝对路径
parent_type: briefing | anthropic-article
created_at: ISO8601
updated_at: ISO8601
---
```

正文示例：

```markdown
## 用户
Constitutional AI 和 RLHF 是什么关系？

## 助手
你认为“原则”和“人类反馈”哪个更先存在？
```

### 兼容

- `article-assistant` 加入 `DocType` 枚举。
- 扫描学习库时该类型不显示在普通 topic 列表，只在打开对应文章时读取。

## 架构与数据流（简述）

- 主进程新增 IPC `articleAssistant:generateGuide`、`articleAssistant:sendMessage`、`articleAssistant:abort`。
- 渲染进程 `Briefing.tsx` / `AnthropicArticleReader.tsx` 挂载 `ArticleAssistant` 组件。
- `ArticleAssistant` 组件内部管理小窗显隐、选中监听、拖拽/拉伸、消息历史。
- `articleAssistant:generateGuide` 调用 `llm-tasks.ts` 非流式生成 JSON 导读。
- `articleAssistant:sendMessage` 组装上下文后调用 `llm:start` 流式回复；若点击 🔍 则先调用 `search:web`。
- 主进程新增文件写入 handler，把旁注记录追加到对应目录。

## 测试策略

### 单元测试

- `digest-guide.md` prompt 装配：验证包含 JSON schema 约束。
- `extractJsonObject` 对 guide 输出的鲁棒性（fence、前后 prose、缺字段）。
- Tavily 搜索结果整理函数：验证格式符合 LLM 上下文模板。

### 组件测试

- 旁注小窗展开/收起。
- 标题栏拖拽移动。
- 任意角拉伸改变宽高。
- 选中文本替换引用块。
- 🔍 按钮 loading 与去重点击。

### E2E

- 打开 briefing 文章 → 右侧导读出现背景/摘要/术语。
- 选中文本 → 点击“旁注”竖条 → 引用块正确显示。
- 输入问题 → 流式回复。
- 点击 🔍 → 验证传给 Tavily 的 query 包含选中引用 + 用户问题。
- 点击 🔍 → 回复基于搜索结果。
- 流式回复中点击停止按钮 → 输出停止。
- 关闭文章 → 对应目录出现 `assistant-session.md`。
- 验证 `assistant-session.md` 的 `parent_path` 和 `parent_type` 与当前文章一致。
- 重新打开同一篇文章 → 旁注历史恢复。
- 边角拉伸成功后窗口尺寸变化可观测。
- 模拟 LLM 返回非 JSON → 右侧导读降级为只显示背景。
- 模拟 Tavily 无结果 → 小窗提示“未找到相关网络来源”并继续回答。

## 风险与规避

1. **生成导读增加首屏时间**：首次生成文章时顺带生成，用 spinner 覆盖；后续从缓存读取。
2. **LLM 输出 JSON 不稳定**：复用已加固的 `extractJsonObject`，失败时降级为只显示原文背景。
3. **Tavily 搜索结果过长**：全部结果摘要注入时总 token 可能超支；若超过阈值，截断单条结果内容而不是丢弃结果条数。
4. **旁注记录堆积**：单文件无限追加；未来可按日期或轮数拆分。

## 后续可扩展

- 把旁注记录导入正式学习会话。
- 对术语表提供发音/例句。
- 支持多篇文章的旁注记录全局检索。