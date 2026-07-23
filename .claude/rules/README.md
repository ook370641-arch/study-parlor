# Claude Code 项目规则

本目录保存从 Study Parlor 开发历史中提炼的长期规则，供 Claude Code 自动加载到每个会话的系统提示词中。

## 规则文件

| 文件 | 覆盖领域 | 路径作用域 | 规则数 |
|---|---|---|---|
| `general.md` | 跨领域 Agent 行为偏差 | 全局 | 8 |
| `feature-development.md` | 功能开发、外部 API 集成、交付验证 | `src/**`, `electron/**`, `docs/superpowers/specs/**` | 11 |
| `e2e.md` | E2E 测试、fixtures、page objects、selectors | `e2e/**`, `tests/**/*.test.ts` | 9 |
| `ipc-state.md` | IPC 契约、状态持久化、frontmatter schema | types/store/ipc/preload/frontmatter/app-paths | 12 |
| `llm.md` | LLM 调用、prompt、JSON 提取、归档触发 | kimi/llm/prompts/llm-tasks/finalize/session-runtime | 9 |
| `ui-styling.md` | React/Tailwind、抽屉、动画、markdown 渲染 | `src/components/**`, `src/pages/**`, `tailwind.config.ts` | 11 |
| `build-dev.md` | 构建、开发环境、打包资源、进程清理 | scripts/electron-builder/main/env/app-paths/vite | 10 |

## 格式约定

- 文件顶部使用 YAML frontmatter：`description`（用途）和可选的 `paths`（作用域 glob）。
- 每条规则包含：
  - 标题
  - **Why**：一句话说明原因
  - 可执行的 checklist（以 `-` 开头）
  - 可选的 **Example**：❌ BAD / ✅ GOOD
  - `Source`：原规则文件章节，便于追溯
- 保持文件简洁，优先用 checklist 和示例代替大段叙述。

## 更新触发条件

1. 用户明确纠正某个 AI 错误，且该错误具有复现模式。
2. 连续两次同类任务出现相同偏差。
3. 项目架构/技术栈发生重大变化，导致旧规则失效。
4. 每季度末回顾一次规则覆盖率与过期规则。

## Changelog

- `2026-07-23` ui-styling 新增 §11：学者夜话设计语言（夜色底+米色衬线+琥珀点睛；语录/引力/画作三个诗意资产登记制；动效可退化；求职星蓝为例外主色的声明方式）。
- `2026-07-19` ui-styling 新增 §10：组件文件只导出组件（来自 Briefing.tsx 导出 formatDisplayDate 破坏 Fast Refresh → App 整树 remount → 看门狗误报的排查）。
- `2026-07-19` build-dev 新增 §10：懒加载链裸依赖必须纳入 `optimizeDeps.include`（来自 react-dom 运行时被 Vite 发现触发 re-optimization → 整页 reload → 棕色闪屏 + 二次加载的复发排查）。
- `2026-07-12` E2E 规则重构：新增"每条启动路径默认静默"约束（来自 startApp 漏传 E2E_SILENT 弹窗的修复），并合并同域条目——进程/目录清理（原 §4/§5/§11）、启动隔离与静默（原 §3/§13）、文档同步与来源可追溯（原 §2/§12），13 条精简为 9 条。
- `2026-07-11` 补充 UI 规则：全局 Chrome 必须与内容状态解耦；新增页面模式/子源时必须同步检查页面级元素（来自夜航简报侧边栏、往期抽屉、Anthropic 背景修复）。
- `2026-07-10` 按官方最佳实践重写：补充 Why、BAD/GOOD 示例、统一路径作用域、精简叙述。
- `2026-07-10` 完成首轮规则沉淀：扫描 535 次提交、38 份 specs，覆盖 8 个高风险模块，生成 67 条规则。
- `2026-07-10` 创建规则目录与 README。

## 草稿目录

`.claude/rules/.tmp/` 是规则挖掘过程中产生的中间草稿目录（如 `iteration-density-report.md`、`briefing-rules-draft.md` 等），已加入 `.gitignore`，**不会被 Claude Code 加载**。最终规则只以上方 `.claude/rules/*.md` 为准。
