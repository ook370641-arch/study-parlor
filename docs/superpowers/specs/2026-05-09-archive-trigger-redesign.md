# 归档触发链路 v3 — 自然语问句 + 计数式去重

**Date**: 2026-05-09
**Status**: Approved (brainstorming)
**Replaces**: `[[SUGGEST_END]]` 隐形 marker / `「本轮归档」` 协议 token 两版

---

## 背景与问题

当前触发链路用一个隐形 marker `[[SUGGEST_END]]`(或上一次试改成的可见协议 token `「本轮归档」`),由 LLM 在判定本轮可结束时输出,前端检测后弹"结束并归档"按钮。

历次问题:

1. **过早触发**:旧 prompt "完成后追加" 措辞模糊,LLM 把"出完第一题"当"完成",第一道题就追加 marker
2. **粘性死锁**:`s.session.suggestEnd ||` 一旦 true 永不撤,后续轮 LLM 改主意了 UI 也撤不下来
3. **隐形 token 用户感受不到**:`[[SUGGEST_END]]` 被前端剥指尾,用户看不到 LLM 在判什么,banner 突兀冒出
4. **/learner skill 用法对齐缺失**:用户已习惯"LLM 主动问'可以存档吗?'然后用户回'可以'"的对话流,但本应用却用了一个完全不同的 marker 协议

---

## 目标

- LLM 用**自然语问句**触发归档询问(对齐 /learner skill 习惯)
- 用户能**直接看到** LLM 在问什么(透明性)
- 代码做**确定性检测**,LLM 做判断,UI 做最终确认(三方分工)
- 用户**点【暂不归档】后不会被同一次 ask 反复打扰**,但 LLM 真再问还是要弹

---

## 设计

### 三层分工

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Prompt 层                                           │
│  • 给 LLM 触发条件(用户求停 / 学习自然结束)                  │
│  • 给 LLM 严格短语契约:必须用 `需要存档吗?` 这 6 字、不变形  │
└─────────────────────────────────────────────────────────────┘
                           ↓ LLM 流式输出
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: 检测层(store.appendChunk)                          │
│  • 检测"本次 chunk 让消息从'未含'变成'含'`需要存档吗?`"      │
│  • 检测到 → archivePending=true                               │
│  • 回喂 LLM 前剥掉 `需要存档吗?` 防自我应和                   │
└─────────────────────────────────────────────────────────────┘
                           ↓ render
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: UI 层(Study.tsx banner)                            │
│  • archivePending && !streaming → 显示 banner                 │
│  • 两个按钮:                                                  │
│    [暂不归档] → archivePending=false(不写盘)                │
│    [归档此次学习] → finalize → 写盘 + 重置 session             │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Prompt 改动

**`electron/prompts/mode-review.md`**

```
你正在进行掌握度检测,基础笔记如下:

---
{{file_content}}
---

请直接出第一题,不要客套。题目要能甄别"看过"和"会用"。

**关于归档询问**

当判定本轮检测可以收尾时,主动询问用户:

需要存档吗?

这 6 字是固定问句,前端检测到这串字会弹出归档确认按钮。**不要变形**(不要写"要存档吗"/"想存档吗"/"可以存档吗"等)。

**何时问**(满足任一即可):
- 用户表达停止意图(任何近义说法都算,如"今天到这"、"先停"、"够了"、"不学了"、"我们改天聊"等)
- 你判断检测内容已自然到达暂停点(覆盖了关键考点,足以判断掌握度)

**何时不问**:
- 用户刚说出主题、刚开始诊断
- 还在追问同一个考点/同一支线
- 仅在给反馈或纠错
```

**`electron/prompts/mode-progress.md`**

```
**关于归档询问**

当判定本轮学习可以收尾时,主动询问用户:

需要存档吗?

这 6 字是固定问句,前端检测到这串字会弹出归档确认按钮。**不要变形**(不要写"要存档吗"/"想存档吗"/"可以存档吗"等)。

**何时问**(满足任一即可):
- 用户表达停止意图(任何近义说法都算,如"今天到这"、"先停"、"够了"、"不学了"、"我们改天聊"等)
- 用户已沉淀至少一个新的可迁移知识点(能自己解释、举例或推导),且到达自然的暂停时机

**何时不问**:
- 用户刚说出主题、刚开始诊断
- 你还在追问同一个概念,用户尚未给出令你满意的回应
- 仅在给反馈或纠错
```

**注意**:两个文件都**删除**之前我加的"重要避坑"段(`需要存档吗?` 是日常话,LLM 在解释时碰巧打出概率太低,不必加保险;真出现误触发,UI 还有用户单击确认这道防线)。

### Layer 2: 检测逻辑改动

**`src/store/index.ts`**

新增 session 字段:`archivePending: boolean`(替换原 `suggestEnd`,语义更清晰)。

```ts
type Session = {
  // ... 其它字段不变
  archivePending: boolean   // 替换 suggestEnd
}
```

**`appendChunk` 重写检测逻辑**(检测"新发起 ask"的边沿):

```ts
appendChunk: (text) => set(s => {
  if (!s.session) return s
  const history = [...s.session.history]
  const last = history[history.length - 1]
  // 记录这次 append 之前的 assistant 消息内容
  const beforeContent = (last?.role === 'assistant') ? last.content : ''

  if (last?.role === 'assistant') {
    history[history.length - 1] = { ...last, content: last.content + text }
  } else {
    history.push({ role: 'assistant', content: text })
  }

  const afterContent = history[history.length - 1].content
  const phrase = '需要存档吗?'
  // 边沿检测:本次 append 让消息**从无到有**地包含问句
  const newAsk = !beforeContent.includes(phrase) && afterContent.includes(phrase)

  // archivePending 是粘性的"有未处理的 ask",但**只在新 ask 时置位**
  // 用户 dismiss 后,只有 LLM 真的再问一次才会重新置位
  const archivePending = s.session.archivePending || newAsk

  return { session: { ...s.session, history, streaming: true, archivePending } }
})
```

**新增 `dismissArchive` action**:

```ts
dismissArchive: () => set(s =>
  s.session ? { session: { ...s.session, archivePending: false } } : s
)
```

**`startSession` / `restoreSession` 初始化**:

```ts
session: { ..., archivePending: false }
```

### Layer 2 (cont.): History 剥指尾改动

**`src/lib/session-runtime.ts:97-101`**

```ts
const history = state.session!.history.slice(-MAX_PAIRS * 2).map(m => ({
  ...m,
  content: m.content.replace(/需要存档吗\?/g, '').trimEnd()
}))
```

(回喂 LLM 前剥掉问句,防止 LLM 看自己上轮问过就接着问。)

### Layer 3: UI 改动

**`src/pages/Study.tsx` banner 重写**(方案 A:单行平列,两按钮):

```jsx
{session.archivePending && !session.streaming && (
  <div className="px-8 max-w-4xl w-full mx-auto">
    <div className="my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded
                    text-sm font-sans text-parchment/80 flex justify-between items-center">
      <span>AI 询问是否归档此次学习</span>
      <div className="flex gap-1.5 items-center">
        <Button variant="ghost" onClick={() => useStore.getState().dismissArchive()}>
          暂不归档
        </Button>
        <Button onClick={onEnd}>归档此次学习</Button>
      </div>
    </div>
  </div>
)}
```

**`src/components/ChatBubble.tsx`**:不改(继续不剥指尾,问句作为自然对话被用户看见)。

**`src/pages/Study.tsx` `assistantHasContent` 检查**:不改(`content.trim().length > 0` 已可)。

### 测试

**`tests/prompts.test.ts`**:

```ts
expect(sys).toMatch(/需要存档吗/)
```

(替换原 `/SUGGEST_END/`。)

---

## 边界情况 / 行为表

| 场景 | 行为 | 实现机制 |
|---|---|---|
| LLM 第 1 次问 `需要存档吗?` | banner 显示 | newAsk 检测到,archivePending=true |
| 用户点【暂不归档】 | banner 关 | dismissArchive 置 false |
| 用户继续打字,LLM 回复**没**问归档 | banner 不弹 | newAsk=false(没有从无到有 transition),archivePending 保持 false |
| 用户继续打字,LLM 第 2 次问 `需要存档吗?` | banner 重新显示 | newAsk=true(新消息从无到有),archivePending=true |
| 用户再点【暂不归档】 | banner 关 | dismissArchive 置 false |
| 用户点【归档此次学习】 | finalize 跑 + reset session | onEnd → finalizeAndReturnHome |
| LLM 在解释里碰巧说出 `需要存档吗?`(概率极低) | banner 显示一次,用户 dismiss 即可 | 用户单击确认作为最后防线 |
| 流式期间 chunk 把问句拼出来(分到两片 chunk) | newAsk 仍然能检测 | beforeContent 是上一片末尾、afterContent 是接上的全文,字符串边界正确处理 |
| restoreSession 从 unsaved 恢复(history 里可能含问句) | archivePending=false 初始,不会因历史含问句而误弹 | restoreSession 显式 init false |
| 用户从 home 重新开始 startSession | archivePending=false | startSession 显式 init false |

---

## 迁移说明(从 `「本轮归档」` 撤回)

代码 `「本轮归档」` 那版改动**未提交**,以下文件仍是 `「本轮归档」` 状态,需要按本设计反向更新:

| 文件 | 当前状态 | 目标状态 |
|---|---|---|
| `electron/prompts/mode-review.md` | 含 `「本轮归档」` 规则 + 避坑段 | 改为 `需要存档吗?` 规则,去避坑段 |
| `electron/prompts/mode-progress.md` | 含 `「本轮归档」` 规则 + 避坑段 | 改为 `需要存档吗?` 规则,去避坑段 |
| `src/store/index.ts:136` | `includes('「本轮归档」')` | 改 newAsk 边沿检测 + archivePending 字段 |
| `src/store/index.ts` | 没有 `dismissArchive` action | 新增 |
| `src/lib/session-runtime.ts:101` | `replace(/「本轮归档」/g, ...)` | 改 `replace(/需要存档吗\?/g, ...)` |
| `src/pages/Study.tsx` banner | 单按钮、文案"AI 已标记..." | 双按钮(暂不归档 + 归档)、文案"AI 询问..." |
| `src/components/ChatBubble.tsx` | 不剥(已就位) | 保持不剥 |
| `tests/prompts.test.ts:43` | `/SUGGEST_END/` | 改 `/需要存档吗/` |

---

## 不在本次改动范围

- 旧 `[[SUGGEST_END]]` / `「本轮归档」` 残留在历史 unsaved sessions JSON 里(已在前几次清洗中处理)
- 复习模式 / 推进模式之外的归档链路(暂不引入)
- 自动检测用户输入(用户输入由 LLM 解读,代码不做关键词匹配)
- 归档失败的 retry / undo 机制(沿用现有 recovery dump 兜底)

---

## 待 review 后转 writing-plans

实施步骤(粒度、依赖、风险点)在 plan 里继续展开。
