# Study Parlor LLM / Prompt / 会话归档规则候选

> 规则来源：归档触发 spec（2026-05-09、2026-05-10）、推荐系统 spec（2026-05-27、2026-06-03、2026-06-05、2026-06-21）、相关代码文件及 git 提交历史。

---

### 1. 归档出口必须是单一、可见、canonical 的自然语问句
- **抽象偏差**：提示词契约漂移（Prompt Contract Drift）——同一功能在多个 prompt 中以不同措辞重复定义，LLM 输出与代码检测无法对齐。
- **本项目表现**：归档触发历经 `[[SUGGEST_END]]` 隐形 marker → `「本轮归档」` 协议 token → `需要存档吗?` 自然语问句。`learner-base.md` 最初直接复制 `/learner skill`，内含 "这次学习可以存档吗？"（全角问号）、"...需要存档吗？"（全角问号）等变体，导致前端 `includes('需要存档吗?')` 漏检；mode-review/mode-progress 也曾与 base prompt 的归档指令冲突。
- **必须这样做**：
  - 由 `learner-base.md` 统一定义唯一出口问句：`需要存档吗?`（6 字，半角问号，不得变形）。
  - mode-specific prompt 只引用该 canonical 问句，不再自行发明变体。
  - 前端检测使用宽容正则 `/需要存档吗\s*[?？]/`，但 prompt 层面仍强制半角问号、禁止变形。
- **常见错误**：
  - 在不同 prompt 文件里写不同问法；
  - 使用用户看不见的隐形 token；
  - 检测逻辑对全角/半角、空格不宽容，却允许 prompt 里出现变体。
- **来源**：spec:`docs/superpowers/specs/2026-05-09-archive-trigger-redesign.md`; commit:`8c49f15`; commit:`4dfa4b5`; commit:`bc39f4c`

---

### 2. 归档检测应在流式消息边界完成，而非每个 chunk 做边沿检测
- **抽象偏差**：过度工程化的边沿检测（Over-engineered Edge Detection）——把本可在消息级完成的判断下沉到 chunk 级，引入状态粘性与边界 bug。
- **本项目表现**：第一版在 `store.appendChunk` 中比较 `beforeContent` 与 `afterContent`，实现 `!before.includes(phrase) && after.includes(phrase)` 的边沿检测。结果导致 `archivePending` 粘性死锁（一旦置 true 无法自动撤下）、chunk 拆分边界处理复杂、用户 dismiss 后 LLM 没再问也会保持 banner。
- **必须这样做**：
  - 流式完成后的 `finishStreaming` 中，仅检查最后一条 assistant 消息的完整内容。
  - `archivePending` 每次重新计算，不依赖 sticky flag 的边沿跃迁。
  - 提供独立的 `dismissArchive()` action，由 UI 按钮显式清除。
- **常见错误**：
  - 在 `appendChunk` 里维护跨 chunk 状态；
  - 把 banner 状态设计成“触发后置位、永不自动复位”；
  - 边沿检测与历史过滤耦合。
- **来源**：spec:`docs/superpowers/specs/2026-05-10-session-archive-redesign-design.md`; commit:`25d97f1`; commit:`305c5e4`

---

### 3. 禁止把触发短语从历史记录中过滤后再回喂 LLM
- **抽象偏差**：状态变更的副作用通道（State Mutation Side-channel）——为了展示干净而修改传给 LLM 的消息，破坏 API 契约。
- **本项目表现**：`session-runtime.ts` 曾在 `sendOrInterrupt` 中用 `.replace(/需要存档吗\?/g, '').trimEnd()` 把历史里的归档问句剥掉，导致某条消息只剩空字符串，Kimi API 返回 400。后改为直接回传完整历史，LLM 可自行识别自己上轮的归档询问。
- **必须这样做**：
  - 持久化和回喂 LLM 的历史保持原样；
  - 若 UI 不想显示问句，在渲染层（ChatBubble / Study 页面）处理，不动消息内容；
  - 发送给 API 前校验消息非空。
- **常见错误**：
  - 在运行时路径 `replace` 掉协议 token；
  - 把“前端展示需求”下沉到会话驱动层；
  - 过滤后未检查空消息。
- **来源**：spec:`docs/superpowers/specs/2026-05-10-session-archive-redesign-design.md`; commit:`e3879da`

---

### 4. 对 LLM 结构化输出永远执行“提取 → 消毒 → 平衡校验 → 形状校验”
- **抽象偏差**：JSON 过度信任（JSON Overtrust）——假设 LLM 会严格按格式返回可直接 `JSON.parse` 的干净内容。
- **本项目表现**：group inspiration、wild card、fable、continue suggestions 最初都直接 `JSON.parse` LLM 输出，失败原因包括：markdown 代码块包裹、前后 explanatory prose、LLM 在 JSON 前写了自然段、文本中含未转义的嵌套引号/花括号、全角引号等。后演化出 `extractJsonObject` / `extractJsonArray`：先剥 ```json 围栏，找首个 `{`/`[` 后的开引号，做括号/字符串平衡扫描，失败再用 fallback 正则，最后写 debug 文件。
- **必须这样做**：
  - 所有 LLM JSON 输出必须先经专用提取函数；
  - 剥除 markdown 代码块；
  - 用开引号定位真实 JSON 起点，避免被前文中的普通 `{` 误导；
  - 解析后校验必要字段（如 `{topic, hook}`、`{title, body}`、`{title, context, rationale, benefit}`）；
  - 提取/解析失败时把原始 prompt 与 response 写入 `~/.studyparlor/debug/`。
- **常见错误**：
  - `JSON.parse(text)` 裸调；
  - 只处理代码块、不处理前后 prose；
  - 只校验 JSON 语法、不校验业务字段；
  - 静默吞掉解析错误。
- **来源**：commit:`363ed95`; commit:`0eecaeb`; commit:`d462f1b`; commit:`e687bad`; commit:`7c9c80c`; commit:`70fc973`

---

### 5. 结构化输出 prompt 必须重复格式禁令并给出负面示例
- **抽象偏差**：格式指令不足（Insufficient Format Instruction）——只说一句“输出 JSON”就期待 LLM 遵守。
- **本项目表现**：group-inspiration v1/v2/v3 和 wild-card-v1、continue-suggestions_prompt_v2 均明确要求：
  - “只输出 JSON，不要任何其他内容”；
  - “不要 markdown 代码块（如 ```json）”；
  - “回复必须直接以 `{` 开头、以 `}` 结尾”；
  - 给出字段级 schema 与示例。
  加入这些负面示例后，JSON 提取失败率显著下降。
- **必须这样做**：
  - 每条结构化 prompt 都包含：禁止 prose、禁止代码块、首尾字符约束、字段列表、空字段用 `""` 而非省略；
  - 对数组输出明确“以 `[` 开头、以 `]` 结尾”；
  - 对对象输出明确“以 `{` 开头、以 `}` 结尾”。
- **常见错误**：
  - 仅写“请输出 JSON”；
  - 示例放在代码块内，反而诱导 LLM 模仿代码块；
  - 不说明字段是否可省略。
- **来源**：spec:`docs/superpowers/specs/2026-05-27-group-inspiration-redesign-design.md`; spec:`docs/superpowers/specs/2026-06-03-continue-topic-suggestions-design.md`; commit:`e687bad`; commit:`7c9c80c`

---

### 6. 将外部 LLM 提供者的所有特殊契约集中到单一适配器
- **抽象偏差**：泄漏的提供者假设（Leaky Provider Assumptions）——API 怪癖散落在多个调用点，导致 model 切换时行为不一致。
- **本项目表现**：Kimi API 要求 `User-Agent: claude-code/0.1.0` 否则 403；`kimi-*` 在 thinking disabled 模式下 temperature 只能为 0.6；thinking enabled 需带 `reasoning_effort`；DeepSeek 的 thinking body 形状不同。所有逻辑集中在 `electron/lib/kimi.ts` 的 `buildChatBody` 中，按 `isKimiModel` / `isDeepSeekModel` / 其他分支处理。
- **必须这样做**：
  - 一个函数（`buildChatBody`）负责构造请求体；
  - 按 model family 分支，不依赖调用方记忆；
  - 对话流（chatStream）默认禁用 thinking 以降低首 token 延迟；
  - 归档/推荐/图表/寓言等结构化任务启用 thinking 并设置 `reasoning_effort` 为 `high`/`max`；
  - 所有 fetch 统一加 `User-Agent`。
- **常见错误**：
  - 多个地方复制 fetch 调用和 header；
  - 对 kimi 用 `temperature: 0.7` 导致 400；
  - 把思考模式同时用于流式聊天和结构化任务。
- **来源**：CLAUDE.md; commit:`7ac7fe4`; commit:`7351a55`; commit:`a71cccf`; commit:`90122ff`; commit:`70fc973`

---

### 7. 每个流式请求必须持有独立 AbortController，并区分总超时与空闲超时
- **抽象偏差**：孤儿流 / 超时混淆（Orphan Stream / Timeout Confusion）——没有清晰的会话级 abort 生命周期，或把连接超时与 SSE 空闲超时混为一谈。
- **本项目表现**：`electron/ipc/llm.ts` 用 `Map<string, AbortController>` 按 `sessionId` 保存控制器；用户点击“中断”时调用 `sessions.get(id)?.abort()`。`chatStream` 设 120s 总超时并在每轮 `reader.read()` 设空闲超时；`chatNonStream` 设 300s 总超时并支持外部 `AbortSignal`；finally 中清理 listener 与 map 条目。
- **必须这样做**：
  - 每个 `llm:start` 创建新的 `AbortController`，按 sessionId 存入 map；
  - `llm:abort` 按 sessionId 触发 abort；
  - 总超时 abort 整个内部控制器；
  - 空闲超时 cancel reader 并抛 `TIMEOUT`；
  - 无论成功、abort、异常，都在 finally 删除 map 条目并移除事件监听。
- **常见错误**：
  - 全局唯一 AbortController；
  - 只设一种超时；
  - abort 后不从 sessions map 删除；
  - 不区分用户主动 abort 与超时 abort。
- **来源**：`electron/lib/kimi.ts`; `electron/ipc/llm.ts`; commit:`70fc973`

---

### 8. 推荐缓存失效必须数据驱动，不能仅依赖时间戳
- **抽象偏差**：缓存与数据模型漂移（Cache-Model Drift）——缓存格式演进后旧数据仍被信任，导致 UI 渲染空字段。
- **本项目表现**：`topicContinueSuggestions` 早期缓存格式为 `{title, reason}`，后改为 `{title, context, rationale, benefit}`。旧缓存与新 UI 混存，导致只显示标题、无内容。修复：在 `TopicContinueCache` 中新增 `sessionCount`，打开 PreStudyModal 时比对主题当前会话数；旧格式（无 `sessionCount`）直接视为失效并重新生成。
- **必须这样做**：
  - 缓存条目携带数据版本或数据校验字段（如 `sessionCount`、schema version）；
  - 格式变更时把旧条目标记为失效，强制重新生成；
  - 缓存更新触发点绑定真实数据事件（归档成功、删除 session、删除 topic），而非定时刷新；
  - 不要把 `dirName` 当 `topic` 传给 LLM。
- **常见错误**：
  - 只看 `generatedAt`；
  - 长期保留旧格式兼容分支；
  - 用文件/目录名代替用户可读主题标题生成推荐；
  - 删除缓存后立刻 re-render 导致卡片闪烁。
- **来源**：spec:`docs/superpowers/specs/2026-06-05-continue-topic-recommendations-unification.md`; `electron/ipc/files.ts`; `electron/lib/llm-tasks.ts`

---

### 9. 推荐类 prompt 必须明确禁止抽象延伸，要求可命名、可讲授的具体主题
- **抽象偏差**：LLM 过度抽象 / 隐喻漂移（Metaphor Creep）——LLM 把“推荐新主题”理解为“已有主题的哲学升华”，产出无法命名的空泛概念。
- **本项目表现**：group inspiration 第一版产出了“认知脚手架”等抽象延伸。 redesigned v1/v2/v3 明确约束：
  - “推荐知识树上的另一个分支，不是已有节点的深挖或抽象延伸”；
  - “30-45 分钟能覆盖核心概念”；
  - “不要硬拗与学习者个人身份的直接关联”；
  - Hook 不超过 40 字，说明该分支在知识树中的位置。
  wild-card 也强调“与学习历史毫不相关、来自跨学科候选域、用日常比喻”。
- **必须这样做**：
  - prompt 中列出“反面示例”（什么不算推荐）；
  - 要求主题粒度可命名、单次会话可覆盖；
  - 禁止把抽象隐喻当作主题；
  - Hook 与主题分离，Hook 解释“为什么值得了解”。
- **常见错误**：
  - 仅说“推荐相关主题”而不定义“相关”；
  - 接受“XX思维”“XX框架”等无法命名的标题；
  - 让 LLM 根据用户身份硬编关联。
- **来源**：spec:`docs/superpowers/specs/2026-05-27-group-inspiration-redesign-design.md`; spec:`docs/superpowers/specs/2026-06-21-wild-card-recommendation-design.md`; `electron/prompts/group-inspiration-v2.md`; `electron/prompts/wild-card-v1.md`

---

### 10. 异步归档前必须快照可变状态并中止活跃流式请求
- **抽象偏差**：流式与异步 I/O 竞态（Race Between Streaming and Async I/O）——在长时间写盘操作期间，SSE 仍在修改同一份 history。
- **本项目表现**：`src/lib/finalize.ts` 在 `finalizeAndReturnHome` 开头：
  1. 若仍在 streaming 先 `ipc.llmAbort`；
  2. `historySnapshot = [...sess.history]` 复制历史；
  3. 立即 `archivePending = false` 防止 banner 闪烁；
  4. 后续所有写库/LLM 调用都基于 snapshot，不再读取 store.session.history。
- **必须这样做**：
  - 归档入口第一句话就是 snapshot 当前 session 数据；
  - 所有后续 async 操作只读 snapshot；
  - 开始 finalize 前确保没有活跃 SSE；
  - 清空所有 transient UI flag（如 `archivePending`）后再进入长时操作。
- **常见错误**：
  - 直接把 `sess.history` 引用传给异步 LLM 调用；
  - finalize 中途读取 store 状态；
  - 不先 abort 就进入归档；
  - archivePending 在长时 finalize 期间反复触发 banner。
- **来源**：spec:`docs/superpowers/specs/2026-05-10-session-archive-redesign-design.md`; `src/lib/finalize.ts`
