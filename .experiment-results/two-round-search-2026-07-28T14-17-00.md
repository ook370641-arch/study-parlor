# 两轮渐进搜索实验报告

- **主题**: 为什么 Claude Code 的 agent harness 架构比其他 AI 编程 agent（Cursor/Copilot/Devin）表现更好
- **LLM**: deepseek-v4-pro
- **耗时**: 88.5s
- **Tavily 调用**: 6 次
- **搜索结果**: 33 条
- **日期**: 2026-07-28T14:17:00.587Z

---

## 第1轮查询词
1. `Claude Code agent harness architecture design`
2. `AI coding agent comparison system prompt engineering`
3. `Claude Code vs Cursor Devin internal tools implementation`

## 第2轮查询词（子维度）
1. `Claude Code agent harness explicit consent permission architecture design`
2. `terminal-native agent harness vs IDE-integrated agent architecture comparison`
3. `post-training harness-in-the-loop model optimization Anthropic Claude Code`

## 第1轮结果摘要
- [Claude Code Agent Harness: Architecture Breakdown | WaveSpeed Blog](https://wavespeed.ai/blog/posts/claude-code-agent-harness-architecture)
- [What Is an Agent Harness? The Architecture Behind ...](https://www.mindstudio.ai/blog/what-is-agent-harness-architecture-explained)
- [AI Agent Harnesses Explained: Architecture, Ecosystem, and ...](https://boringbot.substack.com/p/ai-agent-harnesses-explained-architecture)
- [GitHub - revfactory/harness: A meta-skill that designs domain-specific agent teams, defines specialized agents, and generates the skills they use. · GitHub](https://github.com/revfactory/harness)
- [Agent Harness Engineering](https://addyosmani.com/blog/agent-harness-engineering)
- [What is a harness and how to build one with Claude Agent SDK](https://www.lennysnewsletter.com/p/what-a-harness-is-and-how-to-build)
- [Prompt Engineering for AI Agents](https://www.prompthub.us/blog/prompt-engineering-for-ai-agents)
- [GitHub - tallesborges/agentic-system-prompts: A curated collection of system prompts and tool definitions from production AI coding agents · GitHub](https://github.com/tallesborges/agentic-system-prompts)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [A Practical Guide to Prompt Engineering and AI Agents](https://medium.com/@vprprudhvi/a-practical-guide-to-prompt-engineering-and-ai-agents-004ce4647549)
- [An AI Agent to replace Prompt Engineers : r/PromptEngineering](https://www.reddit.com/r/PromptEngineering/comments/1gcknxs/an_ai_agent_to_replace_prompt_engineers)
- [Best AI Coding Agents in 2026, Ranked](https://mightybot.ai/blog/coding-ai-agents-for-accelerating-engineering-workflows)
- [Devin vs Claude Code: How to choose in 2026](https://www.builder.io/blog/devin-vs-claude-code)
- [Cursor vs Claude Code: Which AI Coding Agent Is Better ...](https://www.truefoundry.com/blog/cursor-vs-claude-code)
- [Claude Code vs Cursor: Which Should You Use?  | Wiz](https://www.wiz.io/academy/ai-security/claude-code-vs-cursor)
- [Claude Code vs Cursor vs GitHub Copilot: Honest Comparison After 30 Days - DEV Community](https://dev.to/dextralabs/claude-code-vs-cursor-vs-github-copilot-honest-comparison-after-30-days-1030)
- [Claude Code vs Cursor vs Devin vs Copilot in 2026](https://medium.com/data-science-collective/claude-code-vs-cursor-vs-devin-vs-copilot-in-2026-the-comparison-everyone-is-still-getting-wrong-5afd6ceff3e7)
- [Claude Code vs Cursor: Which AI Coding Tool Should You Use in 2026?](https://www.simular.ai/alternatives/claude-code-vs-cursor)

## 第2轮结果摘要
- [AI Agent Harnesses Explained: Architecture, Ecosystem, and ...](https://boringbot.substack.com/p/ai-agent-harnesses-explained-architecture)
- [Architectural Design Decisions in AI Agent Harnesses](https://arxiv.org/html/2604.18071v1)
- [Claude Design Principles for Regulated AI Builds](https://petronellatech.com/blog/claude-design-principles)
- [The Design Space of Claude Code and AI Agent Systems](https://www.youtube.com/watch?v=5acB8-Ea4Gg)
- [Agent Architecture: Building AI-Powered Development ...](https://blakecrosley.com/guides/agent-architecture)
- [Building AI Coding Agents for the Terminal](https://arxiv.org/html/2603.05344v1)
- [All Agent Harnesses: The Live Comparison ΓÇö htek.dev](https://htek.dev/articles/all-agent-harnesses-live-comparison)
- [Comparison of Major Harness Implementations | Harness Guide](https://harness-guide.com/guide/comparison)
- [Medium](https://medium.com/@nirman123.doshi/ide-vs-terminal-ai-coding-assistants-why-i-was-skeptical-and-what-i-learned-76b8e1660e5e)
- [What Is an Agent Harness? The Architecture Behind ...](https://www.mindstudio.ai/blog/what-is-agent-harness-architecture-explained)
- [Agent Harness Engineering](https://addyosmani.com/blog/agent-harness-engineering)
- [The Anatomy of an Agent Harness](https://www.dailydoseofds.com/p/the-anatomy-of-an-agent-harness)
- [Nicolas Bustamante on X: "The harness is no longer a wrapper around the model. The harness is part of the model's effective parameters. The post training process embeds the harness's tool surface, schema shapes, memory rituals, citation contracts, and system prompt structure into the model's instinct set. You can take the weights to a different harness, but you cannot take the instincts. The instincts only fire when the harness presents the world the way the post training presented it. Also, the matched pair is not static. The right harness for a model in March is not the right harness for that model's successor in October! Once again, if you want to stay at the edge, you have to delete most of your code when a new model is released... LLMs eat scaffolding for breakfast!" / X](https://x.com/nicbstme/status/2051134422553149874)
- [Harness Engineering for Self-Improvement](https://lilianweng.github.io/posts/2026-07-04-harness)
- [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)

---

## 合成报告

# 为什么 Claude Code 的 Agent Harness 比其他 AI 编程 agent 表现更好

**这是一份内部技术备忘录，不是学术论文。我们直接拆开看 harness 设计的几个关键决策，以及它们为什么能让 Claude Code 在自主编程任务中比 Cursor、Copilot、Devin 少犯错、多做事。**

---

## 竞技场：agent 之间的真正区别不在模型，而在运行时

很多人把编程 agent 的能力差异归结为模型智商，但更隐蔽的分水岭是 **harness**——它是将模型从文本预测器转变为可执行动作的自主 agent 的那一层 [R1-2][R2-10]。Claude Code 的 harness 和 Cursor、Devin、Copilot 的选择根本不是同一个量级。

| 维度 | Claude Code | Cursor | Devin | GitHub Copilot |
|---|---|---|---|---|
| 运行环境 | 终端原生，本地执行 [R1-3][R2-6] | IDE 深度集成，插件式 [R1-14] | 云端容器，每次任务起一个新容器 [R1-3] | 多表面（IDE/Copilot Chat/CLI）[R1-17] |
| 核心定位 | 自主 agent，执行多步骤任务 [R1-14] | 增强开发流程，补全与建议 [R1-14] | 平台化治理，编码化流程 [R1-13] | 辅助编码，分散界面 |
| 权限模型 | 每一个重要操作显式征得同意，零信任 [R1-3][R2-4] | 依赖 IDE 沙箱，较隐式 | IDE 内的审批步骤和 playbook [R1-13] | 离散，无统一权限框架 |
| 上下文策略 | 整库读取，单次任务 10-20 文件变更无丢失 [R1-18] | 语义索引 + @-mention，15+ 文件可能失去连贯性 [R1-18] | 以任务为单位的容器上下文 | 基于当前文件/选区 |
| agent 拓扑 | 可编排子 agent、后台会话 [R2-5][R1-13] | 单 agent，无多 agent [R2-8] | 固定模板的多步骤工作流 | 分散，非统一 agent 循环 |
| 与模型耦合度 | 后训练深度耦合 harness 工具表面 [R1-5][R2-11] | 模型通用，未针对 harness 联合微调 | 使用通用模型 | 通用模型 |

这些选择的后果很直接：Cursor 擅长快速补全和可视 diff，但超出 15 个文件的变更就容易出现“模式看似正确但与项目既定惯例不符”的情况 [R1-16][R1-18]。Devin 为团队流程提供了稳定的治理，却牺牲了高手需要的灵活性和模型-环境紧耦合 [R1-13]。Claude Code 选择了反方向：**把 harness 做得尽可能薄，但安全层和工具层做得极深**。

---

## 拆解 Claude Code 的 harness 三大支柱

### 1. 安全与零信任执行——98% 的代码都在做这件事

根据 Anthropic 研究人员对 Claude Code 架构的分析，系统超过 98% 的代码专注于**安全权限控制、高效上下文管理和操作基础设施**，而真正的 agentic 循环（模型调用→工具调用→返回）只占极小部分 [R2-4]。harness 对文件读取、命令执行、网络访问等所有后续动作施加显式的许可检查，不是一刀切，而是要求用户逐项同意 [R1-3][R2-1]。

后果是：agent 可以在长时间、多步骤任务中自主运作，而不会像传统 AutoGPT 那样“跑飞”。工程师愿意放开手让 Claude Code 改写 20 个文件，是因为他们知道任何危险操作都会被拦截。安全不是限制，而是**自主性的前提**。

### 2. 模型与 harness 不再是分开的两个东西——它们是在一起训练的

Addy Osmani 和 Daily Dose of Data Science 都指出同一件事：**今天的 agent 产品在微调时已经把 harness 纳入训练循环** [R1-5][R2-11][R2-12]。模型学到的不仅是“如何写代码”，更是“如何在 Claude Code 这个特定 harness 提供的工具表面、模式、系统提示结构内高效行动”。

> “你可以把权重带到另一个 harness，但带不走本能。本能只有在 harness 以训练时完全一样的方式呈现世界时才会触发。” —— Nicolas Bustamante [R2-13]

这就是为什么 Opus 4.6 在 Claude Code 里的表现和在其他 harness 里完全不同 [R1-5]。当你改变工具实现逻辑时，模型已经内化的操作模式可能失效，导致奇怪的回归。这种**协同进化**让 Claude Code 的整套工具（如 `write_to_file`/`replace_in_file` 的文件编辑策略 [R1-7]）极致流畅，因为系统提示、工具定义和模型的期望精确对齐。

**与此对比**：Cursor 等 IDE 工具使用的模型是通用的，harness 没有作为一个固定环境进入后训练。这导致某些 pattern——比如在已有代码库中应用重构——可能会给出“内部一致但项目不一致”的建议 [R1-16]。

> ⚠️ 风险提示：这种强耦合也有反方声音。有人担心过度优化 harness 会使模型脱离该环境后变得无用，模型对 harness 的定制化可能成为通用能力的减损 [R2-13]。但至少在当前的任务范围内，这种耦合带来了碾压级的自主性能。

### 3. 可组合 + 最小复杂度：把工作推到小型、专业化 piece 里

Anthropic 的 harness 设计原则明确：“找到最简单的可能解决方案，只在需要时增加复杂性” [R2-3]。Claude Code 不建庞大的自主循环，而是把工作分散到小型专业化块中，通过结构化交接（子 agent 分派、agent teams）协作 [R2-3][R1-4]。

最新版本已经可以用 `claude agents` 命令分派后台会话，指定目录、权限、模型等参数，不依赖包装器状态 [R2-5]。这意味着一个 harness 可以孵化出多个专业化子任务，而 Cursor 明确不支持多 agent 架构 [R2-8]。Devin 的多步骤流程是预设的 playbook，而 Claude Code 允许工程师**像组装 Unix 管道一样组装 agent 团队**。

---

## 限制和矛盾：不是所有人都认为 Claude Code 是第一

MightyBot 在 2026 年的排名中将 OpenAI Codex 列为第一，理由是“模型质量与产品工作流的最佳组合” [R1-12]。Codex 开源的 CLI 和云端沙箱隔离战略在并发隔离和跨平台可移植性上确实更强 [R1-3]。但这份排名中的“产品工作流”偏向全托管体验，而 Claude Code 的竞争力在于**为已有强工具链的团队提供极致控制权** [R1-13]。

另外，终端原生并不适合所有开发者。需要可视化 diff、debugger 深度集成的团队会更钟情 Cursor，而 Claude Code 要求工程师习惯在命令行审查 diff 和错误 [R2-9]。这不是 harness 架构优劣的问题，而是工作流哲学的差异。

---

## 关键数据点速览

- **多文件连贯性**：Claude Code 单任务处理 10–20 个文件变更无上下文丢失；Cursor 在 15 个文件以上可能失去连贯性 [R1-18]
- **安全比例**：harness 代码中 98% 以上用于权限和安全 [R2-4]
- **协同训练**：模型针对特定 harness 工具表面进行后训练，变更工具会降级性能 [R1-5][R2-12]
- **子 agent**：Claude Code 支持 agent teams 和后台分派，Cursor 仅单 agent [R2-8][R2-5]
- **市场分化**：2026 年参考架构一分为二——本地终端有同意机制 vs 云端容器隔离，分别对应 Anthropic 和 OpenAI 的路线 [R1-3][R2-1]

---

## 关键收获

1. **Harness 是模型的“有效参数”**。Claude Code 与模型联合微调，使得模型在特定工具表面上的操作近乎本能。这是 Cursor/Copilot 等非耦合架构难以复制的护城河。
2. **自主性来自零信任，而非绕过**。显式同意和深度权限系统让 agent 能处理大规模变更而不失控，安全不是枷锁而是自治的倍增器。
3. **终端原生 + 可组合子 agent 胜过 IDE 插件式的单 agent 循环**，在大型任务中上下文丢失更少，复杂度管理更优。
4. **最小复杂性原则**：不是建造超级自主循环，而是用小而专的构件通过结构化交接协作，这使得 harness 能随模型升级而腾挪。
5. **没有普适最优**。如果团队需要可视化、轻量补全，Cursor 更合适；需要治理模板，Devin 更稳。但如果你追求极致自主性和模型-工具紧耦合的性能，Claude Code 的 harness 设计是目前最深的。

---

## 来源列表

1. [R1-1] Claude Code Agent Harness: Architecture Breakdown | WaveSpeed Blog - https://wavespeed.ai/blog/posts/claude-code-agent-harness-architecture  
2. [R1-2] What Is an Agent Harness? The Architecture Behind ... - https://www.mindstudio.ai/blog/what-is-agent-harness-architecture-explained  
3. [R1-3] AI Agent Harnesses Explained: Architecture, Ecosystem, and ... - https://boringbot.substack.com/p/ai-agent-harnesses-explained-architecture  
4. [R1-4] GitHub - revfactory/harness - https://github.com/revfactory/harness  
5. [R1-5] Agent Harness Engineering - https://addyosmani.com/blog/agent-harness-engineering  
6. [R1-6] What is a harness and how to build one with Claude Agent SDK - https://www.lennysnewsletter.com/p/what-a-harness-is-and-how-to-build  
7. [R1-7] Prompt Engineering for AI Agents - https://www.prompthub.us/blog/prompt-engineering-for-ai-agents  
8. [R1-8] GitHub - tallesborges/agentic-system-prompts - https://github.com/tallesborges/agentic-system-prompts  
9. [R1-9] Effective context engineering for AI agents - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents  
10. [R1-10] A Practical Guide to Prompt Engineering and AI Agents - https://medium.com/@vprprudhvi/a-practical-guide-to-prompt-engineering-and-ai-agents-004ce4647549  
11. [R1-12] Best AI Coding Agents in 2026, Ranked - https://mightybot.ai/blog/coding-ai-agents-for-accelerating-engineering-workflows  
12. [R1-13] Devin vs Claude Code: How to choose in 2026 - https://www.builder.io/blog/devin-vs-claude-code  
13. [R1-14] Cursor vs Claude Code: Which AI Coding Agent Is Better ... - https://www.truefoundry.com/blog/cursor-vs-claude-code  
14. [R1-15] Claude Code vs Cursor: Which Should You Use? - https://www.wiz.io/academy/ai-security/claude-code-vs-cursor  
15. [R1-16] Claude Code vs Cursor vs GitHub Copilot: Honest Comparison After 30 Days - https://dev.to/dextralabs/claude-code-vs-cursor-vs-github-copilot-honest-comparison-after-30-days-1030  
16. [R1-17] Claude Code vs Cursor vs Devin vs Copilot in 2026 - https://medium.com/data-science-collective/claude-code-vs-cursor-vs-devin-vs-copilot-in-2026-the-comparison-everyone-is-still-getting-wrong-5afd6ceff3e7  
17. [R1-18] Claude Code vs Cursor: Which AI Coding Tool Should You Use in 2026? - https://www.simular.ai/alternatives/claude-code-vs-cursor  
18. [R2-1] AI Agent Harnesses Explained: Architecture, Ecosystem, and ... - https://boringbot.substack.com/p/ai-agent-harnesses-explained-architecture  
19. [R2-2] Architectural Design Decisions in AI Agent Harnesses - https://arxiv.org/html/2604.18071v1  
20. [R2-3] Claude Design Principles for Regulated AI Builds - https://petronellatech.com/blog/claude-design-principles  
21. [R2-4] The Design Space of Claude Code and AI Agent Systems - https://www.youtube.com/watch?v=5acB8-Ea4Gg  
22. [R2-5] Agent Architecture: Building AI-Powered Development ... - https://blakecrosley.com/guides/agent-architecture  
23. [R2-6] Building AI Coding Agents for the Terminal - https://arxiv.org/html/2603.05344v1  
24. [R2-7] All Agent Harnesses: The Live Comparison - https://htek.dev/articles/all-agent-harnesses-live-comparison  
25. [R2-8] Comparison of Major Harness Implementations | Harness Guide - https://harness-guide.com/guide/comparison  
26. [R2-9] Medium: IDE vs Terminal AI Coding Assistants - https://medium.com/@nirman123.doshi/ide-vs-terminal-ai-coding-assistants-why-i-was-skeptical-and-what-i-learned-76b8e1660e5e  
27. [R2-10] What Is an Agent Harness? The Architecture Behind ... - https://www.mindstudio.ai/blog/what-is-agent-harness-architecture-explained  
28. [R2-11] Agent Harness Engineering - https://addyosmani.com/blog/agent-harness-engineering  
29. [R2-12] The Anatomy of an Agent Harness - https://www.dailydoseofds.com/p/the-anatomy-of-an-agent-harness  
30. [R2-13] Nicolas Bustamante on X: "The harness is no longer a wrapper..." - https://x.com/nicbstme/status/2051134422553149874  
31. [R2-14] Harness Engineering for Self-Improvement - https://lilianweng.github.io/posts/2026-07-04-harness  
32. [R2-15] Harness design for long-running application development - https://www.anthropic.com/engineering/harness-design-long-running-apps