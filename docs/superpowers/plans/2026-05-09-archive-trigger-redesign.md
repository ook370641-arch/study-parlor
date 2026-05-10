# 归档触发链路 v3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 `「本轮归档」` 协议 token 撤回,改成 LLM 输出自然语 `需要存档吗?`,store 用 `archivePending` 边沿计数,banner 增加【暂不归档】副按钮。

**Architecture:** 三层:Prompt 层告诉 LLM 何时该问、用哪个固定问句;检测层用边沿(transition from no-include to include)防重弹;UI 层双按钮 banner(主按钮归档、副按钮 dismiss)。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand;Vitest 测试。

**Reference Spec:** [docs/superpowers/specs/2026-05-09-archive-trigger-redesign.md](../specs/2026-05-09-archive-trigger-redesign.md)

---

## File Structure

| 文件 | 责任 |
|---|---|
| `electron/prompts/mode-review.md` | 复习模式契约 + `需要存档吗?` 触发条件 |
| `electron/prompts/mode-progress.md` | 推进模式契约 + 同上 |
| `tests/prompts.test.ts` | prompts 装配测试,断言新短语在拼接结果中 |
| `src/store/index.ts` | `archivePending` 字段 + 边沿检测 + `dismissArchive` action |
| `src/lib/session-runtime.ts` | 回喂 LLM 前剥指尾 |
| `src/pages/Study.tsx` | banner 双按钮 + dismiss handler 接线 |
| `src/components/ChatBubble.tsx` | 不剥指尾(已就位,只更新过时注释) |

---

### Task 1: 重写 mode-review.md

**Files:**
- Modify: `electron/prompts/mode-review.md`

- [ ] **Step 1: 用以下完整内容覆盖文件**

```markdown
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

- [ ] **Step 2: 检验 token 替换完毕**

Run: `grep -c "本轮归档\|SUGGEST_END" electron/prompts/mode-review.md`
Expected: `0`

Run: `grep -c "需要存档吗?" electron/prompts/mode-review.md`
Expected: `2`(一处契约示例 + 一处提及"不要变形")

---

### Task 2: 重写 mode-progress.md

**Files:**
- Modify: `electron/prompts/mode-progress.md`

- [ ] **Step 1: 用以下完整内容覆盖文件**

```markdown
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

- [ ] **Step 2: 检验**

Run: `grep -c "本轮归档\|SUGGEST_END" electron/prompts/mode-progress.md`
Expected: `0`

---

### Task 3: 更新 prompts test 的 regex

**Files:**
- Modify: `tests/prompts.test.ts:43`(具体行号可能因前 commit 微调,关键是那个 `expect(sys).toMatch(/SUGGEST_END/)` 行)

- [ ] **Step 1: 把测试名 + regex 都更新**

旧:
```ts
it('review mode injects file body and SUGGEST_END marker rule', () => {
  const sys = assemblePrompt({
    mode: 'review',
    difficulty: 'mid',
    profile,
    reviewFileBody: '## 拓扑公理\n...'
  })
  expect(sys).toMatch(/掌握度检测/)
  expect(sys).toContain('## 拓扑公理')
  expect(sys).toMatch(/SUGGEST_END/)
})
```

新:
```ts
it('review mode injects file body and 需要存档吗 trigger phrase', () => {
  const sys = assemblePrompt({
    mode: 'review',
    difficulty: 'mid',
    profile,
    reviewFileBody: '## 拓扑公理\n...'
  })
  expect(sys).toMatch(/掌握度检测/)
  expect(sys).toContain('## 拓扑公理')
  expect(sys).toMatch(/需要存档吗\?/)
})
```

- [ ] **Step 2: 跑这一组测试,确认通过**

Run: `npx vitest run tests/prompts.test.ts`
Expected: `Test Files 1 passed | Tests 6 passed`

- [ ] **Step 3: 提交 prompt + test 一起**

```bash
git add electron/prompts/mode-review.md electron/prompts/mode-progress.md tests/prompts.test.ts
git commit -m "$(cat <<'EOF'
feat(prompt): replace 「本轮归档」 token with natural-language 需要存档吗?

- mode-review.md and mode-progress.md now instruct LLM to ask the natural
  Chinese question 需要存档吗? (6 chars, strict no-variants) when it judges
  the round can wrap up
- Drop the previous 避坑 paragraph (probability of LLM accidentally typing
  this 6-char phrase mid-explanation is low; UI single-click confirm is
  enough as a final guard)
- Update prompts test to match the new trigger string

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: store 加 `archivePending` + 边沿检测 + `dismissArchive`

**Files:**
- Modify: `src/store/index.ts`(多处:type Session、startSession、restoreSession、appendChunk、加 dismissArchive action、AppStore 类型)

- [ ] **Step 1: 在 `Session` type 把 `suggestEnd` 改为 `archivePending`**

旧 `Session` type(约第 11-23 行):
```ts
type Session = {
  mode: Mode
  topic: string
  dirName?: string
  file_path?: string
  difficulty: Difficulty
  temperature: number
  history: Message[]
  streaming: boolean
  abortId: string
  suggestEnd: boolean
  reviewFileBody?: string
}
```

新:
```ts
type Session = {
  mode: Mode
  topic: string
  dirName?: string
  file_path?: string
  difficulty: Difficulty
  temperature: number
  history: Message[]
  streaming: boolean
  abortId: string
  archivePending: boolean   // LLM 是否问了 "需要存档吗?" 且尚未被用户处理(归档/dismiss)
  reviewFileBody?: string
}
```

- [ ] **Step 2: `AppStore` type 加 `dismissArchive` action 声明**

定位(约 47-71 行 actions 部分),在 `endSession` 行下方加:

```ts
  endSession: () => void
  dismissArchive: () => void   // 用户点【暂不归档】,清掉本次 ask
  resetSession: () => void
```

- [ ] **Step 3: `startSession` 初始化 archivePending: false**

定位 `startSession`(约 107-122 行),把 session 字面量里的 `suggestEnd: false` 改为 `archivePending: false`:

旧:
```ts
session: {
  mode: a.mode, topic: a.topic, dirName: a.dirName, file_path: a.file_path,
  difficulty: a.difficulty, temperature: a.temperature,
  history: [], streaming: false, abortId: sid, suggestEnd: false
},
```

新:
```ts
session: {
  mode: a.mode, topic: a.topic, dirName: a.dirName, file_path: a.file_path,
  difficulty: a.difficulty, temperature: a.temperature,
  history: [], streaming: false, abortId: sid, archivePending: false
},
```

- [ ] **Step 4: 重写 `appendChunk` 用边沿检测**

定位 `appendChunk`(约 124-138 行),整段替换:

旧:
```ts
  appendChunk: (text) => set(s => {
    if (!s.session) return s
    const history = [...s.session.history]
    const last = history[history.length - 1]
    if (last?.role === 'assistant') {
      history[history.length - 1] = { ...last, content: last.content + text }
    } else {
      history.push({ role: 'assistant', content: text })
    }
    // 非粘性:仅以"当前正在流的这条 assistant 消息"是否含「本轮归档」决定
    // suggestEnd。这样 LLM 后续轮如果不再判定该结束,UI 提示也能撤回。
    // token 是**可见**的协议字符 —— LLM 在判定本轮可结束时显式写在最末一行,
    // ChatBubble 不再剥离它,用户能直接验证 LLM 是否真说了这 4 个字。
    const suggestEnd = history[history.length - 1]?.content.includes('「本轮归档」') ?? false
    return { session: { ...s.session, history, streaming: true, suggestEnd } }
  }),
```

新:
```ts
  appendChunk: (text) => set(s => {
    if (!s.session) return s
    const history = [...s.session.history]
    const last = history[history.length - 1]
    // 记录 append 之前的 assistant 消息内容(用于边沿检测)
    const beforeContent = (last?.role === 'assistant') ? last.content : ''

    if (last?.role === 'assistant') {
      history[history.length - 1] = { ...last, content: last.content + text }
    } else {
      history.push({ role: 'assistant', content: text })
    }

    const afterContent = history[history.length - 1].content
    const phrase = '需要存档吗?'
    // 边沿检测:本次 append 让消息**从无到有**包含问句
    const newAsk = !beforeContent.includes(phrase) && afterContent.includes(phrase)
    // archivePending 是粘性的"有未处理的 ask",但**只在新 ask 边沿**才置位
    // → 用户 dismiss 后,只有 LLM 真的再问一次才会重新置位(不会被同一句反复触发)
    const archivePending = s.session.archivePending || newAsk

    return { session: { ...s.session, history, streaming: true, archivePending } }
  }),
```

- [ ] **Step 5: 加 `dismissArchive` action 实现**

定位 `endSession: () => { ... }`(约 161-163 行),在它**下方**加:

```ts
  endSession: () => {
    // 占位,实际 finalize 流程由 Study 页触发
  },

  dismissArchive: () => set(s =>
    s.session ? { session: { ...s.session, archivePending: false } } : s
  ),

  resetSession: () => set({ session: null, currentPage: 'home' }),
```

- [ ] **Step 6: `restoreSession` 初始化 archivePending: false**

定位 `restoreSession`(约 199-215 行),把 session 字面量里的 `suggestEnd: false` 改为 `archivePending: false`:

旧:
```ts
session: {
  mode: unsaved.mode,
  topic: unsaved.topic,
  dirName: unsaved.dirName,
  file_path: unsaved.file_path,
  difficulty: unsaved.difficulty,
  temperature: unsaved.temperature,
  history: unsaved.history,
  streaming: false,
  abortId: crypto.randomUUID(),
  suggestEnd: false
},
```

新:
```ts
session: {
  mode: unsaved.mode,
  topic: unsaved.topic,
  dirName: unsaved.dirName,
  file_path: unsaved.file_path,
  difficulty: unsaved.difficulty,
  temperature: unsaved.temperature,
  history: unsaved.history,
  streaming: false,
  abortId: crypto.randomUUID(),
  archivePending: false
},
```

- [ ] **Step 7: 类型检查**

Run: `npx tsc --noEmit 2>&1 | grep "src/store/index.ts" || echo "store ok"`
Expected: `store ok`(本文件无 TS 报错)

注意: 仓库里其它预存在的 TS 报错(`recommend.ts`、tests/types.test.ts 等)不在本任务范围,只看本文件干净即可。

- [ ] **Step 8: 提交**

```bash
git add src/store/index.ts
git commit -m "$(cat <<'EOF'
refactor(store): suggestEnd → archivePending with edge detection + dismiss

- Rename Session.suggestEnd → archivePending (clearer semantic: "an unhandled
  archive ask is pending")
- Replace `includes('「本轮归档」')` with edge detection on '需要存档吗?':
  archivePending only flips true on the transition from "previous chunk
  doesn't include phrase" to "current chunk includes phrase". This means
  ongoing chunks of the same message don't re-trigger; only a fresh ask in
  a new LLM turn re-fires.
- Add dismissArchive action so the [暂不归档] button can clear the flag
  without writing the file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 更新 session-runtime 的 history strip 正则

**Files:**
- Modify: `src/lib/session-runtime.ts:97-102`

- [ ] **Step 1: 替换那段 `replace` 调用**

旧:
```ts
  // 回喂 LLM 前剥掉「本轮归档」:LLM 看到自己上一轮以该 token 收尾,会自我应和
  // 在每轮都重复追加。token 对用户可见(ChatBubble 不剥),但对 LLM 不该可见。
  const history = state.session!.history.slice(-MAX_PAIRS * 2).map(m => ({
    ...m,
    content: m.content.replace(/「本轮归档」/g, '').trimEnd()
  }))
```

新:
```ts
  // 回喂 LLM 前剥掉 "需要存档吗?":LLM 看到自己上一轮以该问句收尾,会
  // 在后续每轮重复追问 → 自我应和。问句对用户可见(ChatBubble 不剥),但对
  // LLM 不该可见 —— 让 LLM 每轮都基于"用户当前状态"独立判断是否该问。
  const history = state.session!.history.slice(-MAX_PAIRS * 2).map(m => ({
    ...m,
    content: m.content.replace(/需要存档吗\?/g, '').trimEnd()
  }))
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/session-runtime.ts
git commit -m "$(cat <<'EOF'
refactor(session-runtime): strip '需要存档吗?' (not 「本轮归档」) from LLM history

Defense-in-depth: even though the new prompt design tells LLM to ask only
when conditions met, stripping the question from the history we feed back
prevents accidental self-reinforcement (LLM seeing its own prior ask and
echoing the pattern).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 更新 Study.tsx — banner 双按钮 + dismiss 接线 + 状态字段改名

**Files:**
- Modify: `src/pages/Study.tsx`(三处:`assistantHasContent` 上下注释、banner JSX、condition 字段名)

- [ ] **Step 1: 把 `session.suggestEnd` 出现的地方都改为 `session.archivePending`**

定位(约第 130 行附近的 banner condition):

旧:
```jsx
      {session.suggestEnd && !session.streaming && (
```

新:
```jsx
      {session.archivePending && !session.streaming && (
```

- [ ] **Step 2: 重写 banner 的内容(双按钮 + dismiss handler)**

整段替换 banner 区块:

旧:
```jsx
      {session.suggestEnd && !session.streaming && (
        <div className="px-8 max-w-4xl w-full mx-auto">
          <div className="my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded
                          text-sm font-sans text-parchment/80 flex justify-between items-center">
            <span>AI 已标记「本轮归档」 — 是否将本轮存入学习库?</span>
            <Button onClick={onEnd}>归档此次学习</Button>
          </div>
        </div>
      )}
```

新:
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

- [ ] **Step 3: 清理 `assistantHasContent` 上方的过时注释**

定位(约第 73-77 行):

旧:
```ts
  // streaming=true 但还没收到任何 assistant 内容 → 显示"正在思考..."
  // 注意:「本轮归档」token 现在对用户可见,所以含 token 也算"有内容"
  const lastMsg = session.history[session.history.length - 1]
  const assistantHasContent =
    lastMsg?.role === 'assistant' &&
    lastMsg.content.trim().length > 0
```

新:
```ts
  // streaming=true 但还没收到任何 assistant 内容 → 显示"正在思考..."
  // 注意:"需要存档吗?" 是自然语,对用户可见,trim 后非空就算"有内容"
  const lastMsg = session.history[session.history.length - 1]
  const assistantHasContent =
    lastMsg?.role === 'assistant' &&
    lastMsg.content.trim().length > 0
```

- [ ] **Step 4: 类型检查 + 跑全测试**

Run: `npx tsc --noEmit 2>&1 | grep "src/pages/Study.tsx" || echo "study ok"`
Expected: `study ok`

Run: `npx vitest run`
Expected: `Test Files 10 passed | Tests 80 passed`(全过)

- [ ] **Step 5: 提交**

```bash
git add src/pages/Study.tsx
git commit -m "$(cat <<'EOF'
feat(ui): archive banner now has dismiss button + matches new state name

- session.suggestEnd → session.archivePending (matches store rename)
- Banner gets a [暂不归档] ghost button alongside the primary [归档此次学习]
  button. Clicking 暂不归档 calls store.dismissArchive(), which clears the
  pending flag without finalizing.
- Banner text changes from "AI 已标记..." to "AI 询问是否归档此次学习" to
  reflect that the trigger is now the natural question, not a hidden token.
- Cleanup stale comment about 「本轮归档」 visibility.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: ChatBubble.tsx 注释清理(无逻辑改动)

**Files:**
- Modify: `src/components/ChatBubble.tsx`(只更新过时注释)

- [ ] **Step 1: 替换注释**

旧(约第 5-7 行):
```ts
  // 「本轮归档」token 对用户**可见**:LLM 写出这 4 个字时直接展示给用户看,
  // 让用户能验证 banner 触发的源头。前端只 trim,不剥。
  const content = msg.content.trim()
```

新:
```ts
  // 归档触发问句 "需要存档吗?" 是自然语,对用户可见 —— 让用户在聊天里直接看到
  // LLM 何时问的归档,banner 才不会显得"凭空冒出来"。前端只 trim,不剥。
  const content = msg.content.trim()
```

- [ ] **Step 2: 提交**

```bash
git add src/components/ChatBubble.tsx
git commit -m "docs(comment): update ChatBubble note for 需要存档吗? trigger phrase

No logic change — the bubble already doesn't strip; just bring the comment
in sync with the new (natural-language) trigger.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 8: 全量验证 + 残留扫除

**Files:** 无写入,只做检查

- [ ] **Step 1: 确认仓库代码里再没有任何旧 token 残留**

Run: `grep -rn "SUGGEST_END\|本轮归档" src/ electron/ tests/ --include="*.ts" --include="*.tsx" --include="*.md"`
Expected: 完全无输出(若有任何匹配,回到对应 task 修补)

- [ ] **Step 2: 全量测试**

Run: `npx vitest run`
Expected: `Test Files 10 passed | Tests 80 passed`

- [ ] **Step 3: 类型检查 — 我们改的文件应当 0 报错**

Run: `npx tsc --noEmit 2>&1 | grep -E "src/store/index\.ts|src/lib/session-runtime\.ts|src/pages/Study\.tsx|src/components/ChatBubble\.tsx" || echo "all changed files clean"`
Expected: `all changed files clean`

(仓库其它预存在 TS 报错与本次改动无关,不在范围内)

- [ ] **Step 4: 现存 unsaved sessions 残留检查**

Run: `node -e "const fs=require('fs'),p=require('path'),d='C:/Users/86468/.studyparlor/sessions';if(!fs.existsSync(d)){console.log('no sessions dir');process.exit(0)}for(const n of fs.readdirSync(d)){if(!n.endsWith('.json'))continue;const j=JSON.parse(fs.readFileSync(p.join(d,n),'utf8'));for(const m of j.history||[]){if(typeof m.content==='string'&&(m.content.includes('SUGGEST_END')||m.content.includes('本轮归档'))){console.log('STALE TOKEN in',n);process.exit(1)}}}console.log('all session files clean')"`
Expected: `all session files clean` 或 `no sessions dir`

如果输出 `STALE TOKEN in <file>`,跑这个清洗(只有匹配到时才需要):
```bash
node -e "const fs=require('fs'),p=require('path'),d='C:/Users/86468/.studyparlor/sessions';for(const n of fs.readdirSync(d)){if(!n.endsWith('.json'))continue;const fp=p.join(d,n);const j=JSON.parse(fs.readFileSync(fp,'utf8'));let dirty=false;for(const m of j.history||[]){if(typeof m.content==='string'){const c=m.content.replace(/\[\[SUGGEST_END\]\]|「本轮归档」/g,'').trimEnd();if(c!==m.content){m.content=c;dirty=true}}}if(dirty){fs.writeFileSync(fp,JSON.stringify(j,null,2),'utf8');console.log('cleaned',n)}}"
```

- [ ] **Step 5: 重启 dev 验证(手动,plan 里只列步骤)**

主进程 prompts 是 `fs.readFileSync` 加载的,Vite HMR 不重载,**必须重启 `npm run dev`** 后做以下 smoke 测试:

1. 进 review 模式,故意答 1 题就停下:LLM 应当**不会**追问归档(prompt 改软了)
2. 答完 2-3 个考点 → LLM 应当主动问 `需要存档吗?` → banner 出现
3. 点【暂不归档】 → banner 消失 → 继续打字
4. 用户说"今天到这" → LLM 听懂,再问一次 `需要存档吗?` → banner 重新出现
5. 点【归档此次学习】 → 写文件 + 跳 home

(此步骤无 commit,只是 plan 完成的实证标准)

---

## 执行顺序

Tasks 必须按 1 → 8 顺序;每个 task 内的 step 也按数字顺序。Task 内最后一个 step 是 commit。Task 4 因为 store 改动量大,内部分了 8 个 step;其它 task 都是 ≤ 5 个 step。

总 commit 数:**6 个**(Tasks 3、4、5、6、7 各一,Task 8 不 commit)。

---

## 风险点

| 风险 | 缓解 |
|---|---|
| LLM 在解释里偶尔写出 `需要存档吗?` 触发误归档 | UI 单击确认作为最后防线 + 用户能直接看到聊天里这 6 字才弹 |
| chunk 把 `需要存档吗?` 切成两段(如 chunk1=`需要存档`,chunk2=`吗?`) | beforeContent + afterContent 都用全量 message 内容做 includes,边沿检测仍然正确触发一次(只在拼合那一刻满足条件) |
| restoreSession 后用户继续聊,旧 history 含问句导致误弹 | restoreSession 显式 init `archivePending: false`,而 newAsk 检测的是边沿(transition),旧问句已在 init 时算"已经存在",不会被识别为"新边沿" |
| 仓库别处仍有 `suggestEnd` 引用未改到 | Task 8 的 Step 1 grep 扫除做兜底 |
