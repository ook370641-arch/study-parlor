# 学者夜话(Study Parlor)— v1 设计文档

> 把 `/learner` 苏格拉底式辅导能力包成一个本地单用户 Electron 应用,管理与之匹配的 .md 学习笔记。

---

## 0. 一句话定位

把已有的 17 份 .md 学习笔记 + 7 张配图,装进一个有"夜读"质感的本地学习仪式。
新主题用推进 mode 跟 AI 苏格拉底式探索,旧主题用检测 mode 做掌握度复习。

---

## 1. v1 范围

**做**

- 学习助手单模块(推进 + 检测 双 mode)
- 个人档案(画像 / 偏好 / 默认难度温度)
- 文件库(读 .md + frontmatter 元数据)
- 三栏推荐主页(左 1 文件卡 + 中 [新学习] + 2 LLM 灵感 + 右 1 文件卡)

**不做(留 v2)**

- 寓言模式
- 知识图谱可视化
- 多设备同步
- 会话中途自动保存(只在主动结束时保存)
- 文件库搜索 / 标签筛选

---

## 2. 技术栈

| 层 | 选择 | 理由 |
|---|---|---|
| 应用容器 | **Electron** | 仪式感(独立窗口) + 纯 JS 栈,可读本地文件 |
| UI | React + TypeScript | 主流 + 可维护 |
| 样式 | Tailwind CSS + shadcn/ui | 与已锁定的视觉语言(Disco Elysium 暗色 + 暖橙)兼容 |
| 状态 | **Zustand** 单 store | 比 Redux 轻,够用 |
| LLM | Kimi For Coding(KFC)OpenAI 兼容端点 | 复用已有 `sk-kimi-...` token |
| 持久化 | 文件系统(.md + .json),**无数据库** | 17 → 100 文件量级,SQLite 是过度设计 |

---

## 3. 目录与持久化

### 3.1 项目目录布局

```
study-parlor/
├── .env                          # KIMI_API_KEY / STUDY_LIBRARY_PATH 等
├── .gitignore
├── package.json
├── electron/
│   ├── main.ts                   # 主进程入口
│   ├── ipc/
│   │   ├── files.ts              # 读写 .md
│   │   ├── llm.ts                # Kimi 调用 + SSE 转发
│   │   └── state.ts              # 读写 ~/.studyparlor/state.json
│   └── prompts/
│       ├── learner-base.md       # 来自现有 /learner skill
│       ├── mode-review.md        # 检测 mode 注入
│       ├── difficulty-mid.md     # 中档约束
│       └── difficulty-low.md     # 低档约束
├── src/
│   ├── pages/
│   │   ├── Cover.tsx
│   │   ├── Home.tsx
│   │   ├── Study.tsx
│   │   └── Profile.tsx
│   ├── components/
│   │   ├── PreStudyModal.tsx     # 难度/温度 picker
│   │   ├── RecCard.tsx           # 推荐卡
│   │   ├── ChatBubble.tsx
│   │   └── ...
│   ├── store/
│   │   └── index.ts              # Zustand
│   └── styles/
└── docs/
    └── superpowers/specs/
        └── 2026-05-03-study-parlor-design.md   # 本文件
```

### 3.2 学习库根目录(用户数据)

**默认路径**:`c:\Users\86468\Desktop\工作与学习\学习\`(用户已有的 17 份 .md 所在目录)

**通过 .env 覆盖**:`STUDY_LIBRARY_PATH=...`

设计原则:学习库是用户的,**不锁进 app 内部**,可继续在 Obsidian / VSCode 同步编辑。

```
<学习库根目录>/
├── 拓扑学基础.md
├── 贝叶斯入门.md
├── ...
└── images/                       # 7 张 PNG 等附件
```

### 3.3 .md frontmatter schema

```yaml
---
title: "拓扑学基础"
created: 2025-12-15T20:00:00+08:00
last_studied: 2026-04-28T22:13:00+08:00
last_reviewed: 2026-04-30T21:05:00+08:00
review_count: 2
difficulty: mid                   # 上次会话使用的难度档,纯记录
tags: [数学, 几何]                # 用户自填,影响 LLM 灵感推荐
---

# 笔记正文(由 LLM 在结束推进会话时生成,可手工编辑)
...

## 复习记录 2026-04-30
(检测 mode 完成时追加的对话摘要)
```

### 3.4 ~/.studyparlor/state.json schema

```json
{
  "version": 1,
  "profile": {
    "name": "...",
    "profile_text": "学习者画像(自由文本)",
    "preferred_topics": ["心理", "数学", "经济"]
  },
  "lastUsed": {
    "difficulty": "mid",
    "temperature": 0.7
  },
  "recommendation_cache": {
    "generated_at": "2026-05-03T19:00:00+08:00",
    "left":  { "type": "continue", "file_path": "..." },
    "right": { "type": "review",   "file_path": "..." }
  },
  "suggested_new_topics": {
    "generated_at": "2026-05-03T19:00:01+08:00",
    "topics": [
      { "topic": "贝叶斯统计入门", "hook": "用直觉而非公式" },
      { "topic": "热力学第二定律", "hook": "从生活的不可逆开始" }
    ]
  },
  "ui": { "session_count": 23 }
}
```

附属文件:

- `~/.studyparlor/state.json.bak` —— 每次写入前自动备份(只保留最近一份)
- `~/.studyparlor/recovery/` —— 写文件失败时的临时存放目录

### 3.5 .env

```
KIMI_API_KEY=sk-kimi-...
KIMI_BASE_URL=https://api.kimi.com/coding/v1
KIMI_MODEL=kimi-k2.6
STUDY_LIBRARY_PATH=c:\Users\86468\Desktop\工作与学习\学习
```

---

## 4. Prompt 架构与 LLM 调用

### 4.1 三轴正交

LLM 行为由 3 个完全独立的轴控制:

| 轴 | 取值 | 影响 |
|---|---|---|
| **mode** | 推进(progress) / 检测(review) | 是否注入"复习上下文"段 |
| **difficulty** | 高 / 中 / 低 | 高 = baseline 不变;中 / 低 各加一段 suffix 约束 |
| **temperature** | 0.3 / 0.7 / 1.0 | 仅作为 API 参数,不动 prompt |

注:难度内部蕴含两个隐性变量 ① 知识/探索深度 ② 协作指数。三档对应不同组合,但用户感知只是"档"。

### 4.2 系统 prompt 装配链

```
[BASE] /learner skill 原文
   ↓
[REVIEW CONTEXT]?      ← 仅 mode=review 注入,带文件 body
   ↓
[CONSTRAINT-MID/LOW]?  ← 仅 difficulty=mid/low 注入
   ↓
[USER PROFILE]         ← profile.profile_text + preferred_topics
```

### 4.3 难度档约束

`difficulty-mid.md`:

```
降低探索深度,核心 + 常见应用即可。卡顿时补前置概念。
```

`difficulty-low.md`:

```
提问前先给无答案辅助信息(场景铺垫 / 概念框架,但不给结论)。
覆盖核心即可,不深入边界。答错给提示,不反问。
```

### 4.4 检测 mode 上下文模板

`mode-review.md`:

```
你正在进行掌握度检测,基础笔记如下:

---
{{file_content}}
---

请直接出第一题,不要客套。题目要能甄别"看过"和"会用"。
完成后追加 [[SUGGEST_END]] 标记。
```

### 4.5 LLM API 调用

```http
POST https://api.kimi.com/coding/v1/chat/completions
Authorization: Bearer sk-kimi-...
Content-Type: application/json

{
  "model": "kimi-k2.6",
  "stream": true,
  "temperature": 0.3 | 0.7 | 1.0,
  "messages": [
    { "role": "system", "content": <assembled> },
    ...history
  ]
}
```

**响应**:标准 OpenAI 风格 SSE。每 `data: {...}` 一行,`[DONE]` 终止。

**辅助调用**(归档时提取标题、灵感生成):同端点,但 `stream: false`。

### 4.6 模型选择与下架风险

- 默认 `kimi-k2.6`(2026 主力,256K 上下文)
- ⚠️ K2 旧系列(`kimi-k2-0905-preview` / `kimi-k2.5` / `kimi-k2-turbo-preview`)将于 **2026-05-25** 整体下线
- **启动探活**:`GET /v1/models` 校验 `KIMI_MODEL` 仍在线,失败 → toast + 标记 `modelInvalid=true`
- 网络失败时探活静默,推迟到首次 LLM 调用再阻断

### 4.7 流式与中断

- main 拿 SSE,逐 chunk 通过 `webContents.send('llm:chunk', text)` 推 renderer
- renderer 用 `[DONE]` 判定结束;无 `[DONE]` 视为中断
- 用户中途再发消息 → `abortCtl.abort()` 取消旧请求,立即发新请求
- 被中断的部分回复**保留**在 history 里(作为完整的 assistant 消息),用户的新消息接在后面;LLM 看到的是"上次说到一半被打断 + 新提问"

### 4.8 会话生命周期

**推进 mode**

- 入场首条消息:`{role: "user", content: "今夜想学:{{topic}}"}`(自动发送)
- 结束触发:LLM 输出 `[[SUGGEST_END]]` **或** 用户点 `[结束]`
- 归档:调一次非流式 LLM,**同时**提取标题 + 提炼笔记正文(**精炼摘要,非完整对话原文**) → 写新 `.md`(frontmatter + body)

**检测 mode**

- 入场无 user message,LLM 直接基于 system prompt 主动开第一题
- 输入框激活,占位文字"先听 AI 出题..."(允许打断)
- 结束触发:同推进
- 归档:更新原 `.md` 的 frontmatter(`last_reviewed` / `review_count++`),并在 body 末尾追加:
  ```
  ## 复习记录 2026-05-03
  (本次对话 LLM 提炼的关键问答摘要)
  ```

---

## 5. UI 流程与状态

### 5.1 页面树

```
Cover ──► Home ──┬── PreStudy(模态) ──► Study ──► Home
                 ├── Profile ──► Home
                 └── (Home 内部:三栏推荐 + 文件库)
```

### 5.2 各页面状态机

| 页面 | 关键状态 | 说明 |
|---|---|---|
| **Cover** | `name=null` 等待输入 / `name` 已存在 → 1.5s 自动进 Home | 视觉:cover-b(中央插画 + 焦点展开输入框) |
| **Home** | `empty` / `loaded` / `library-only` | 三栏推荐 + 下方文件库 + 右上 Profile 按钮 |
| **PreStudy 模态** | 主题输入(仅新学习) + 难度/温度选择 | 默认 = `state.lastUsed`,选完写回 |
| **Study** | `idle → first-frame → streaming → idle → ... → suggesting-end → finalizing → 跳 Home` | 推进 / 检测共用骨架 |
| **Profile** | `view / edit / saved`(2s 提示) | 改默认值,不影响当前会话 |

### 5.3 全局状态(Zustand)

```ts
type AppState = {
  // 持久化(写 state.json)
  profile: { name: string; profile_text: string; preferred_topics: string[] }
  lastUsed: { difficulty: 'high' | 'mid' | 'low'; temperature: number }
  recommendation_cache: { left?: RecCard; right?: RecCard }
  suggested_new_topics: { generated_at: string; topics: NewTopic[] } | null

  // 临时(内存)
  session: null | {
    mode: 'progress' | 'review'
    topic: string
    file_path?: string                 // 检测 mode 才有
    difficulty: 'high' | 'mid' | 'low'
    temperature: number
    history: Message[]
    streaming: boolean
    abortCtl: AbortController | null
    suggestEnd: boolean
  }

  // UI 路由
  currentPage: 'cover' | 'home' | 'study' | 'profile'
  modal: null | 'preStudy'
  modelInvalid: boolean                // 启动探活结果
}

type RecCard  = { type: 'continue' | 'review'; file_path: string }
type NewTopic = { topic: string; hook: string }
type Message  = { role: 'system' | 'user' | 'assistant'; content: string }
```

### 5.4 关键交互

| 交互 | 行为 |
|---|---|
| **ESC** | Study:弹"确认结束?" / PreStudy 模态:关闭 / Profile edit:取消 / 其他:无作用 |
| **流式中断** | 用户在 streaming 中再发消息 → 取消旧请求,立即发新 |
| **重名冲突** | 推进 finalization 写新 `.md` 时若标题已存在 → 文件名后缀加 `-HHMM` |
| **Profile 保存** | 即时生效,不影响当前会话 |
| **[新学习] 按钮点击** | 打开 PreStudy 模态,主题字段空白,焦点放在主题输入 |
| **灵感 chip 点击** | 打开 PreStudy 模态,主题字段预填该 topic,焦点放在难度选择 |
| **推荐卡点击(继续/复习)** | 打开 PreStudy 模态,无主题输入框,只选难度/温度;选完进对应 mode 的 Study |
| **finalization 完成** | 跳回 Home + 顶部 toast"《拓扑学基础》已归档"(2s 自动消失) |

### 5.5 视觉锁定

| 元素 | 选定 | 备注 |
|---|---|---|
| 整体调性 | A:Disco Elysium 暗色仪式感 | 深褐 #2a1f1a / 米色 #e8d5b7 / 暖橙 #d97757 / 蓝灰 #3a5a6a / 深红 #8a3a3a |
| 封面 | cover-b(中央插画框) | 上方 16:9 插画位待 image gen 后期填入 |
| 输入框 | focus 展开样式 ② | GPU 合成 transform,零成本 |
| 主按钮 | 双层错位 ②(暖橙 + 蓝灰偏移阴影) | 全站统一 |

---

## 6. 推荐与首页布局

### 6.1 三栏对称布局

```
┌──────────────┬────────────────────┬──────────────────┐
│              │                    │                  │
│  ① 复习/继续 │     [ 新 学 习 ]   │  ② 复习/继续    │
│   单张卡      │                    │   单张卡         │
│              │   💡 想学 X 吗?    │                  │
│              │   💡 想学 Y 吗?    │                  │
└──────────────┴────────────────────┴──────────────────┘
                   ─ 文件库 ─
       拓扑学基础  ·  贝叶斯入门  ·  ...
```

| 位置 | 内容 | 来源 |
|---|---|---|
| **左** | 单张卡:**继续学习**(优先)或 **复习** | 扫 `.md` frontmatter |
| **中** | `[新学习]` CTA + 2 个 LLM 灵感 chip | LLM 调用 |
| **右** | 单张卡:与左互补(继续 vs 复习) | 扫 `.md` frontmatter |

互补策略:优先一边继续、一边复习;某一池为空时,允许两边同类。

### 6.2 frontmatter 候选条件

| 卡类型 | 候选条件 | 排序 |
|---|---|---|
| **继续学习** | `last_studied` 在最近 3 天内,且未走完整一遍 | `last_studied` 倒序,取 1 |
| **复习** | `last_reviewed` 为空 或 距今 ≥ 7 天,且 `review_count < 3` | `last_reviewed` 升序(空值优先),取 1 |

边界:

- 0 文件 → 左右两栏不显示,只剩中央
- 文件不够分类 → 不强凑
- 用户点"换一组"小图标 → 同规则重算,避开当前两张

### 6.3 LLM 灵感主题生成

**触发**:

- 冷启动(若 `suggested_new_topics` 缓存超过 24h)
- 完成一次会话后(下次回 Home 看到的是新的)
- 用户手动点"换一组"图标

**Prompt**:

```
你正在为 {{user.name}} 推荐 2 个新的学习主题。

学习者画像:{{profile_text}}
偏好领域:{{preferred_topics}}
已学过(避免重复):{{已存在的 .md 标题列表}}

请输出 2 个具体、单次会话能讲完的主题,JSON 格式:
[
  { "topic": "...", "hook": "一句话引子(不超 16 字)" },
  ...
]
```

调用参数:`temperature: 0.7`,`stream: false`。

**缓存**:写 `state.suggested_new_topics`,启动时直接渲染,后台异步刷新。

**失败回退**:中央栏只显示 `[新学习]` 不显示 chip(避免"AI 在挣扎"体感)。

### 6.4 文件库

3 栏下方平铺所有 `.md` 标题(17 文件够用)。100+ 时再加搜索/折叠,本期不做。

---

## 7. 错误处理

| 类别 | 例子 | 显示 / 行为 |
|---|---|---|
| 网络/API 临时故障 | 超时、5xx、断网 | streaming 区顶部红色提示条,带"重试 / 取消";**保留已收到内容** |
| 配置错误 | 401 token 失效、`.env` 缺失 | 全屏弹窗,阻断使用 |
| 限流 | 429 | 自动 30s 后台等待重试,提示"请求过快,稍候..." |
| 模型下架 | 404 model not found | toast + 跳 Profile 让用户从可用列表选 |
| 文件 IO 失败 | 写 `.md` 失败、磁盘满 | 弹窗提示,会话内容暂存到 `~/.studyparlor/recovery/` |
| state.json 损坏 | JSON 解析失败 | 自动加载 `.bak` + toast |
| LLM 输出异常 | 不出 `[[SUGGEST_END]]`、上下文超长 | 用户始终能手动 `[结束]`;超长时截断保留最近 N 条 |

**核心承诺**:任何错误都不让用户丢已经写下的对话内容。

---

## 8. 启动顺序

```
1. 加载 .env  →  缺 KIMI_API_KEY 弹窗阻断
2. 读 state.json  →  损坏则加载 .bak + toast
3. 扫描 STUDY_LIBRARY_PATH/*.md  →  解析 frontmatter,缓存元数据
4. (异步)GET /v1/models 探活 KIMI_MODEL
   不在线 → toast,标记 modelInvalid=true
   网络失败 → 静默,推迟到首次 LLM 调用
5. 计算左右两张推荐卡(基于 frontmatter)
6. (异步)调 LLM 生成 2 条灵感主题(若缓存超过 24h)
7. 创建 BrowserWindow,加载 React
8. 渲染 Cover  →  name=null 等输入 / 否则 1.5s 自动进 Home
```

---

## 9. v2 范围(此次不做)

- 寓言模式(用故事讲概念)
- 知识图谱可视化(`.md` 标题 + tag 自动关联)
- 多设备同步
- 会话中途自动保存(目前只在结束时保存)
- 文件库搜索 / 标签筛选(到 100+ 后再加)
- LLM 调用失败的"续接"重试(当前是从头重发)
- Profile 的"学习者画像"AI 辅助续写

---

## 10. 待办与开放问题

可在实现期间继续讨论,**不阻塞 v1 启动**:

- [ ] 检测 mode 的"复习记录"摘要 prompt 还需调试以保证简洁
- [ ] Cover 页中央插画(cover-b 占位框)需要 image gen 后期填入
- [ ] LLM 提取 `.md` 标题的 prompt 模板细节(归档时调用)
- [ ] 三栏在窄屏(< 1024px)下的折叠策略

---

## 11. 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-05-03 | 选 Electron 而非 Tauri / 纯 web | 用户重视"打开应用的仪式感" + 已熟 JS 栈 |
| 2026-05-03 | 不上数据库 | 17 → 100 文件量级,文件 + JSON 够用 |
| 2026-05-03 | 难度三档,温度独立三档,正交 | 难度改 prompt,温度只改 API 参数,职责分离 |
| 2026-05-03 | 高难度 = baseline 不变 | "高"是 `/learner` 原始体验,不应叠加约束 |
| 2026-05-03 | 检测 mode 让 LLM 主动开场 | 复习应由"出题方"开口,符合直觉 |
| 2026-05-03 | 学习库直接读用户原目录 | 不锁定文件,允许 Obsidian / VSCode 同步编辑 |
| 2026-05-03 | 模型默认 `kimi-k2.6` | 旧 K2 系列 5/25 下线,提前换 |
| 2026-05-03 | 三栏推荐(2 文件 + 1 新学习含 LLM 灵感) | 用户偏好对称布局 + LLM 主动建议价值更高 |
| 2026-05-03 | 只在主动结束时保存,不自动保存 | 简化 v1;v2 再考虑 |
| 2026-05-03 | PreStudy 用模态而非独立页 | 用户感知"还在主页选了一下设置就开始" |
| 2026-05-03 | 个人档案放 Home 右上小按钮 | 不打断主流程,需要时一步即达 |

---

> 本设计文档锁定后,下一步用 superpowers:writing-plans skill 拆成可执行的实施计划。
