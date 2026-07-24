---
description: "Use when calling LLMs, writing prompts, parsing JSON output, or handling session finalization."
paths:
  - "electron/lib/kimi.ts"
  - "electron/ipc/llm.ts"
  - "electron/prompts/**"
  - "electron/lib/llm-tasks.ts"
  - "src/lib/finalize.ts"
  - "src/lib/session-runtime.ts"
---

# LLM 规则

## 1. 归档出口必须是单一、可见、canonical 的自然语问句

**Why:** 多个变体让前端检测与 prompt 契约对不齐。

- 由 `learner-base.md` 统一定义：`需要存档吗?`（6 字，半角问号，不得变形）。
- mode-specific prompt 只引用该 canonical 问句，不再自行发明变体。
- 前端检测用宽容正则 `/需要存档吗\s*[?？]/`，但 prompt 层面强制半角问号。
- Source: llm.md §1

## 2. 归档检测应在流式消息边界完成

**Why:** chunk 级边沿检测引入状态粘性死锁和复杂边界处理。

- 在 `finishStreaming` 中仅检查最后一条 assistant 消息的完整内容。
- `archivePending` 每次重新计算，不依赖 sticky flag 的边沿跃迁。
- 提供独立的 `dismissArchive()` action 由 UI 显式清除。
- Source: llm.md §2

## 3. 禁止把触发短语从历史记录中过滤后再回喂 LLM

**Why:** 剥掉问句可能让某条消息变空字符串，导致 API 400。

- 持久化和回喂 LLM 的历史保持原样。
- 若 UI 不想显示问句，在渲染层处理，不动消息内容。
- 发送给 API 前校验消息非空。
- Source: llm.md §3

## 4. LLM 结构化输出必须执行“提取 → 消毒 → 平衡校验 → 形状校验”

**Why:** LLM 输出常带 markdown fence、前后 prose、未转义引号或全角引号。

- 所有 LLM JSON 输出必须先经专用提取函数。
- 剥除 markdown 代码块；用开引号定位真实 JSON 起点，避免被普通 `{` 误导。
- 解析后校验必要字段；失败时把原始 prompt 与 response 写入 `~/.studyparlor/debug/`。
- Source: llm.md §4

## 5. 结构化输出 prompt 必须重复格式禁令与负面示例

**Why:** 只说“输出 JSON”不足以约束模型行为。

- 明确禁止 prose、markdown 代码块、装饰性标题，给出字段级 schema 与示例。
- 数组输出明确“以 `[` 开头、以 `]` 结尾”；对象输出明确“以 `{` 开头、以 `}` 结尾”。
- 空字段用 `""` 而非省略。
- Source: llm.md §5

## 6. 将 LLM 提供者特殊契约集中到单一适配器

**Why:** provider 怪癖散落在调用点会导致切换 model 时行为不一致。

- 一个函数（`buildChatBody`）负责构造请求体；按 model family 分支。
- 对话流默认禁用 thinking 以降低首 token 延迟；结构化任务启用 thinking 并设置 `reasoning_effort`。
- 所有 fetch 统一加 `User-Agent: claude-code/0.1.0`。
- Source: llm.md §6

## 7. 每个流式请求持有独立 AbortController，区分总超时与空闲超时

**Why:** 全局控制器或单一超时会在多会话/慢响应场景下互相干扰。

- 每个 `llm:start` 创建新的 `AbortController`，按 sessionId 存入 map。
- `llm:abort` 按 sessionId 触发 abort；总超时 abort 整个内部控制器；空闲超时 cancel reader 并抛 `TIMEOUT`。
- 无论成功、abort、异常，都在 finally 删除 map 条目并移除事件监听。
- Source: llm.md §7

## 8. 推荐类 prompt 必须禁止抽象延伸

**Why:** LLM 容易把“推荐主题”理解为已有概念的哲学升华，产出无法命名的空泛概念。

- prompt 中列出“反面示例”。
- 要求主题粒度可命名、单次会话可覆盖。
- 禁止把抽象隐喻当作主题；Hook 与主题分离，Hook 解释“为什么值得了解”。
- Source: llm.md §8

## 9. 异步归档前必须快照可变状态并中止活跃流式请求

**Why:** 在长时间写盘/LLM 调用期间，SSE 仍在修改同一份 history。

- 归档入口第一句话就是 snapshot 当前 session 数据。
- 所有后续 async 操作只读 snapshot；开始 finalize 前确保没有活跃 SSE。
- 清空所有 transient UI flag（如 `archivePending`）后再进入长时操作。
- Source: llm.md §9

## Example: JSON extraction

- ❌ `JSON.parse(llmText).items`
- ✅ `extractJsonArray(llmText)` → `JSON.parse` → `Array.isArray(arr)` → filter `typeof q === 'string'`
