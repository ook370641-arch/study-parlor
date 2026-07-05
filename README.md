# 学者夜话 / Study Parlor

> 一个极乐迪斯科风格的本地 AI 深夜书房。  
> 不是聊天机器人，而是会追问的老师、档案管理员和永久知识库。

[⬇️ 下载最新版](https://github.com/ook370641-arch/study-parlor/releases/latest) · [English →](#english)

<!-- 建议替换为应用主界面截图或 5-10 秒演示 GIF -->
<!-- ![学者夜话主界面](./docs/assets/hero-screenshot.png) -->

---

## 为什么我做这个

AI 已经成了我最常用的学习帮手，但「知道它能」和「它真帮到我」之间，总差一口气。

每次聊完让 AI 总结报告、手动保存，但没几天就放弃了。那些曾经让我豁然开朗的对话像风，吹过去就散了——没有积累，没有方向。

作为一个哲学本硕背景、长期和文本打交道的人，我想要一个能陪我长期学习的本地 AI 伙伴。它不只是聊天机器人，更像我的老师、档案管理员和私人书房。

经过一个半月、252 次提交，它成了「学者夜话」。

---

## 它解决三个问题

### 1. 你不会提问，它也不会追问

普通 AI 对话是你问它答。学者夜话把这个关系颠倒过来：**AI 提问，你回答**。它先诊断你的起点，用一系列有针对性的问题引导你自己推出答案。

它不会直接告诉你答案。只会问出那个让你「啊，原来如此」的问题。

### 2. 聊完就散，没有连续性

每次夜话结束，应用会自动归档一篇学习笔记：你的起点、知识的关键突破、认知缺口、掌握度评估、未来发展建议。同一个主题下的多次夜话各自独立，又都归在一起。

回到旧主题，AI 会读取你的学习进度，自然接续。

### 3. 纯文字记不住，知识结构看不见

每次学习结束，除了文字报告，你还会得到两样东西：

- **一张流程图**：把概念关系和推导脉络画清楚
- **一则寓言**：把抽象概念变成可触摸的角色和情节，在「啊，原来如此」的瞬间记住它

---

## 核心功能

- **苏格拉底式夜话** — AI 根据你的背景和选择的难度，一步步追问，引导你自己发现答案
- **自动归档** — 每次对话生成学习报告，存为本地 Markdown，按分组 / 主题 / 夜话三层整理
- **智能复习** — 基于笔记出题考你、找薄弱点、给掌握度评分，复习记录独立存档
- **主题推荐** — 基于学习历史推荐下一步方向：继续深入、串联主题、或补基础概念
- **寓言与流程图** — 用故事帮你记忆，用图表帮你理清结构
- **你的笔记永远属于你** — 所有内容都是纯 Markdown，存在你指定的本地文件夹，卸载也不会丢
- **深夜书房般的体验** — 深褐、米色、暖橙配色，名画背景，沉浸式语言体系（夜话、笔录、封存、焚毁……）

---

## 下载安装

**👉 [点击下载最新版本](https://github.com/ook370641-arch/study-parlor/releases/latest)**

| 平台 | 文件 | 安装方式 |
|---|---|---|
| Windows | `study-parlor-setup-x.x.x-x64.exe` | 双击运行，按提示安装 |
| macOS (Apple Silicon) | `学者夜话-x.x.x-arm64.dmg` | 打开 dmg，将应用拖入 Applications |
| macOS (Intel) | `学者夜话-x.x.x-x64.dmg` | 打开 dmg，将应用拖入 Applications |

首次启动时，配置向导会引导你填入 API Key（推荐使用 DeepSeek V4，也支持任意 OpenAI 兼容端点）和本地学习库路径。

> **macOS 用户注意**：首次打开可能提示「无法验证开发者」，请右键点击应用 → 选择「打开」→ 确认即可。

---

## 快速开始

1. 下载并安装
2. 首次启动填入 API Key 和学习库路径
3. 在首页选一个主题，或新建一个分组 / 主题
4. 点击「落印」，开始第一次「夜话」
5. 聊完后结束会话，学习报告、寓言、流程图会自动归档到你的学习库

---

## 开发者

### 扩展能力

开发者版本内置了两个 Skill：`study` 和 `fable`。你可以在工作流中直接调用，生成的报告会自动归档到学习库。

### 技术栈

| 层级 | 技术 |
|---|---|
| 桌面端 | Electron 30 |
| 前端 | React 18 + TypeScript |
| 样式 | Tailwind CSS |
| 状态 | Zustand |
| 构建 | electron-vite |
| 测试 | Vitest |
| 打包 | electron-builder |

### 本地运行

```bash
git clone https://github.com/ook370641-arch/study-parlor
cd study-parlor
npm install
cp .env.example .env  # 编辑 .env 填入 API Key 和学习库路径
npm run dev
```

常用命令：

```bash
npm run dev        # 开发模式
npm run test       # 运行测试
npm run build      # 生产构建
npm run package    # 构建 Windows 安装包 → release/
```

---

## 路线图

- [ ] **本地文件读取**：让 AI 直接读取你的资料、项目文件，基于真实上下文展开学习
- [ ] **网络搜索**：每次夜话开始时同步最新网络资讯
- [ ] **行业日报**：根据你的学习领域，每天早上推送一份简报
- [ ] **用户画像**：自动扫描学习库，画出一张知识全景图
- [ ] **作家语录**：封面随机展示喜欢的作家句子
- [ ] **DIY 字段**：标签、分类、术语可按你的习惯自定义
- [ ] **随机推荐**：故意推荐完全无关的主题，打破信息茧房

---

## 许可

[MIT](LICENSE)

---

## English

**Study Parlor** is a local Electron learning companion powered by Kimi / OpenAI-compatible APIs. It provides Socratic tutoring for your personal Markdown study library.

Instead of answering your questions directly, it asks you questions, diagnoses your starting point, and guides you to discover answers yourself. After each session, it automatically archives a study report, generates a fable, and draws a flowchart — all saved as plain Markdown files in folders you own.

- [Download latest release](https://github.com/ook370641-arch/study-parlor/releases/latest)
- Run the installer and configure your API key + study library path on first launch
- Pick a topic and start your first session

```bash
git clone https://github.com/ook370641-arch/study-parlor
cd study-parlor
npm install
cp .env.example .env
npm run dev
```

[MIT License](LICENSE)
