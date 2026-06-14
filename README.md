# Study Parlor / 学者夜话

> A local Electron learning companion powered by Kimi AI. Socratic tutoring for your personal Markdown study library.
>
> 基于 Kimi AI 的本地 Electron 学习助手，为你的个人 Markdown 学习库提供苏格拉底式辅导。

## ⬇️ Download / 下载安装

**👉 [点击这里下载最新版本](https://github.com/ook370641-arch/study-parlor/releases/latest)**

| 平台 / Platform | 文件 | 安装方式 |
|---|---|---|
| Windows | `study-parlor-setup-x.x.x-x64.exe` | 双击运行，选择安装目录，自动生成桌面快捷方式 |
| macOS | `学者夜话-x.x.x-arm64.dmg`（Apple Silicon）<br>`学者夜话-x.x.x-x64.dmg`（Intel） | 双击打开 dmg，将应用拖入 Applications 文件夹 |

> **macOS 用户注意**：首次打开可能提示"无法验证开发者"，请右键点击应用 → 选择"打开" → 确认即可。

安装后首次启动会引导你配置 Kimi API Key 和学习库路径，按提示操作即可。

---

## English

### Why Study Parlor

You open it at night, pick a topic, and chat like talking to a friend who knows their stuff. When you're done, you close it — your study report, a fable, and the full transcript are already saved. A week later, you come back to review, and instead of re-reading, the tutor quizzes you, spots your weak points, and gives you an honest score.

No cloud. No lock-in. Just your thoughts, organized.

### Features

- **Chat to Learn, Walk Away** — Just talk. When you're done, the AI writes your study report, generates a fable, and saves the full transcript. You don't lift a finger.
- **Fables That Make Concepts Stick** — Every session ends with a story. The concept only reveals itself at the "moment of insight" — because understanding sticks when you discover it yourself.
- **Review Is a Test, Not a Reread** — The tutor quizzes you, finds your weak spots, and gives you an honest mastery score. No more passive re-reading.
- **Pick Up Where You Left Off** — Returning to a topic? The AI remembers your last progress and continues the conversation naturally.
- **Your Notes, Forever Yours** — Everything is saved as plain Markdown files in folders you own. Stop using the app? Your knowledge is still there, readable in any editor.
- **A Warm Companion for Night Study** — Classic paintings as backdrop, warm parchment tones, one-on-one dialogue — it feels like a late-night conversation, not a tutoring session.

### Installation

**Prerequisites:** Node.js 20+, npm 10+

1. Clone the repository:
   ```bash
   git clone https://github.com/ook370641-arch/study-parlor
   cd study-parlor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   # macOS / Linux
   cp .env.example .env
   # Windows
   copy .env.example .env
   # Edit .env and fill in your Kimi API key and study library path
   ```

4. Start in development mode:
   ```bash
   npm run dev
   ```

### Usage

- **Home** — Browse your Markdown library, start a study session, or review past notes.
- **Study** — Engage in a Socratic dialogue with the AI tutor. Interrupt anytime to redirect the conversation.
- **Profile** — View and edit your learner profile, which customizes the AI's teaching style.
- **Packaging** — Build a Windows installer:
  ```bash
  npm run package
  ```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 30 |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Build | electron-vite |
| Testing | Vitest |
| Packaging | electron-builder (Windows NSIS) |

### Project Structure

```
study-parlor/
├── electron/           # Main process & IPC handlers
│   ├── main.ts
│   ├── preload.ts
│   └── ipc/            # files, llm, state
├── src/
│   ├── pages/          # cover, home, preStudy, study, profile
│   ├── components/     # Reusable UI components
│   ├── lib/            # Session runtime, finalization logic
│   ├── store/          # Zustand store
│   └── types/          # TypeScript types & IPC API definitions
├── tests/              # Vitest test suite
└── public/             # Static assets
```

### Development

```bash
npm run dev          # Development mode (keep terminal running)
npm run test         # Run all tests
npm run test:watch   # Test watch mode
npm run build        # Production build
npm run package      # Build Windows installer → release/
```

---

## 中文

### 为什么选择学者夜话

你在夜晚打开它，选一个主题，像和一位懂行的朋友聊天。聊完你直接关掉——学习报告、寓言故事、完整对话记录已经自动存好。一周后你回来复习，AI 不是让你重读，而是出题考你、找出薄弱点、给你诚实的掌握度评分。

没有云端。没有绑架。只有你的思考，被好好整理。

### 功能特性

- **聊完就走，笔记自动生成** — 你只需要对话。结束后 AI 自动写学习报告、生成寓言故事、保存完整对话记录。你什么都不用管。
- **用寓言帮你记住概念** — 每次学习结束，AI 都会写一则故事。概念在"领悟时刻"才点破——因为只有自己发现的东西才记得住。
- **复习是考试，不是重读** — AI 导师会考你、找薄弱点、给你诚实的掌握度评分。告别被动翻笔记。
- **上次学到哪了？接着聊** — 回到一个主题，AI 自动读取你的学习进度，自然接续。
- **笔记永远属于你** — 所有内容都是纯 Markdown 文件，存在你的文件夹里。不用这个应用了，知识依然可用任何编辑器打开。
- **深夜学习的陪伴感** — 名画背景、暖褐色调、一对一对话——像是和老朋友深夜夜话，不是上课。

### 安装

**前置条件：** Node.js 20+, npm 10+

1. 克隆仓库：
   ```bash
   git clone https://github.com/ook370641-arch/study-parlor
   cd study-parlor
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 配置环境变量：
   ```bash
   # macOS / Linux
   cp .env.example .env
   # Windows
   copy .env.example .env
   # 编辑 .env，填入你的 Kimi API Key 和学习库路径
   ```

4. 启动开发模式：
   ```bash
   npm run dev
   ```

### 使用说明

- **首页** — 浏览 Markdown 学习库，开始学习会话或复习过往笔记。
- **学习** — 与 AI 导师进行苏格拉底式对话。可随时打断并重定向话题。
- **资料** — 查看和编辑学习者档案，定制 AI 的教学风格。
- **打包** — 构建 Windows 安装包：
  ```bash
  npm run package
  ```

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面端 | Electron 30 |
| 前端 | React 18 + TypeScript |
| 样式 | Tailwind CSS |
| 状态 | Zustand |
| 构建 | electron-vite |
| 测试 | Vitest |
| 打包 | electron-builder (Windows NSIS) |

### 项目结构

```
study-parlor/
├── electron/           # 主进程与 IPC 处理器
│   ├── main.ts
│   ├── preload.ts
│   └── ipc/            # files, llm, state
├── src/
│   ├── pages/          # cover, home, preStudy, study, profile
│   ├── components/     # 可复用 UI 组件
│   ├── lib/            # 会话运行时、归档逻辑
│   ├── store/          # Zustand 状态管理
│   └── types/          # TypeScript 类型与 IPC API 定义
├── tests/              # Vitest 测试套件
└── public/             # 静态资源
```

### 开发命令

```bash
npm run dev          # 开发模式（保持终端运行）
npm run test         # 运行所有测试
npm run test:watch   # 测试监视模式
npm run build        # 生产构建
npm run package      # 构建 Windows 安装包 → release/
```

---

## License / 许可证

[MIT](LICENSE)
