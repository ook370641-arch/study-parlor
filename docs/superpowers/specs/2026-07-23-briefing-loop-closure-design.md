# 夜航简报功能闭环补全设计

- 日期：2026-07-23
- 状态：已批准（brainstorming 结论）
- 前置：全量代码审计（5 个子 agent 覆盖 digest / 求职 / Anthropic+旁注+标注 / 写作 / E2E 覆盖）
- 范围：`src/pages/Briefing.tsx`、`src/components/briefing/*`、`src/components/anthropic/*`、`src/components/article-assistant/*`、`src/components/job-briefing/*`、`electron/ipc/{briefing,job-briefing,article-assistant}.ts`、`electron/lib/{briefing 相关,job-briefing.ts}`、`src/store/index.ts`、E2E specs

## 1. 背景与审计结论

夜航简报已从「每日日报」演进为四来源（digest / Anthropic 博客 / 求职简报 / 写作）的阅读-理解-沉淀系统。本轮审计站在用户视角回答「功能是否闭环」，结论：

- **输入 → 理解 → 沉淀**三段链路完整（生成/导读/旁注/标注/持久化均可用）
- **沉淀 → 输出/行动**断裂：读到的内容无法一键进入写作；标注写完即沉底
- 若干半截功能与可靠性缺口（详见 §4/§5）

### 关键用户决策（2026-07-23 brainstorming）

| 决策点 | 结论 |
|---|---|
| 读→写通道 | 只做「转入写作」按钮（全文），不做选段引用 |
| 标注回看 | 单篇文章内列表入口，不做跨文章汇总 |
| 求职卡片行动状态（⭐/✕/已投递） | 本轮不做 |
| digest 重生成时伴生文件失效 | 不做（用户不会在有标注后重生成）；仅做删除时级联清理 |

## 2. 用户需求模型（反向总结）

| 功能 | 用户场景 | 痛点 | 本轮补全方式 |
|---|---|---|---|
| 转入写作 | 读到有价值的简报/文章想写点什么 | 手动切 tab、新建、复制粘贴，路径不可发现 | 文章头部一键转入（§3） |
| 标注回看 | 一篇文章划了多处标注想快速定位 | 只能全文滚动寻找笔标记 | 单篇标注列表 + 点击跳转（§4） |
| 删除清理 | 删除一篇简报 | 旁注会话/标注/导读残留为孤儿文件 | 级联删除（§5） |

## 3. 转入写作（读→写通道）

- **入口**：digest 两种 layout（`AcademicBriefingLayout` / `NewspaperBriefingLayout`）与 `AnthropicArticleReader` 的文章头部加「转入写作」按钮。job-briefing 不加（卡片流非文章）。
- **行为**：渲染进程组合现有 IPC，无需新增主进程接口：
  1. `writingCreateFile({ root: 'writing', dir: '', name: <文章标题> })`；若返回 `WRITING_NAME_CONFLICT`，标题追加 `-HHMM` 后缀重试一次，仍冲突则 toast 报错
  2. `writingWrite({ path, body })` 写入全文 markdown
- **frontmatter**：新文件头部写入 `source_type: digest|anthropic`、`source_path: <原文件相对路径>`。
- **反馈**：成功后 toast「已转入写作」；**不自动跳转**到写作 tab（最小惊讶）。
- **E2E**：digest 页点击 → 断言 `writing/` 下新文件存在、frontmatter 含 source 字段、toast 出现。

## 4. 单篇标注列表

- **入口**：digest 两种 layout + `AnthropicArticleReader` 文章头部加「标注 (n)」按钮，n = 当前文章标注数（无标注时不显示）。
- **面板**：列出本文所有标注（选中文字截断 + 备注 + §段落号）。
- **跳转**：点击条目 `scrollIntoView` 到对应 `.anno-wrap` 并短暂高亮闪烁。
- **数据**：复用现有 `annotationsRead(articlePath)` IPC，无新存储、无跨文章索引。
- **E2E**：创建 2 条标注 → 打开列表断言内容 → 点击第一条 → 断言滚动到标注位置。

## 5. 删除文章时级联清理伴生文件

- `briefing:delete` 与 `jobBriefing:delete` 扩展：删除 `.md` 时同步删除同目录同名伴生文件 `.assistant.md` / `.annotations.md` / `.guide.md`（存在才删，单个失败不阻断其余）。
- ConfirmDialog 文案补充「将同时删除该简报的旁注对话与标注」。
- Anthropic 文章无删除 UI，不在本轮范围。
- **E2E**：seed 带伴生文件的简报 → 删除 → 断言四类文件全部消失。

## 6. 半截功能清理

| 项 | 改动 |
|---|---|
| `salary` 采而不渲 | `synthesize.md` 输出格式加薪资行；`JobBriefingRenderer.parseJobs` 解析，岗位卡城市行显示「城市 · 薪资」 |
| `cities` 死配置 | 注入 `buildEventQueries` 与岗位查询词尾部（如「北京 上海」），参与检索 |
| `skillKeywords` 设置幻觉 | Settings 移除「关注技能」输入（雷达功能不存在）；state 字段保留读取兼容但不再展示。`profile.skills` 已覆盖该需求 |
| 死代码组件 | 删除 `BriefingAbstract` / `BriefingReferences` / `BriefingSpark` / `BriefingHistoryDrawer`（全仓 grep 已验证零引用，含 e2e） |
| 导读↔正文联动断头 | `GuideSidebar` hover 已写 store `activeChunkIndex`（store:1324）；把 `activeChunkIndex` / `onChunkEnter` / `onChunkLeave` props 传给三处 `ArticleBodyChunks` 调用方（`AnthropicArticleReader` 与两个 briefing layout），复活已有的 `isActive` 样式 |

## 7. 可靠性修复

### 7.1 FEED_EMPTY 与 NETWORK_ERROR 区分

- `fetchJsonWithRetry` 返回值改为 `{ status: 'ok' | 'empty' | 'failed', data? }`：
  - 网络/解析失败 → `failed`；抓取成功但内容为空数组 → `empty`
- 聚合规则：三源全 `failed` → 抛 `NETWORK_ERROR`（可重试）；全 `empty` → `FEED_EMPTY`（无重试，文案不变）；混合按现状继续生成。
- `sourceStatus` 增加 `'empty'` 态；Header 对 empty 显示「暂无更新」而非「获取失败」。

### 7.2 生成取消

- 新增 `briefing:abort` / `jobBriefing:abort` IPC，接入两处已有的 AbortController。
- `BriefingProgress` 旁加「取消」按钮；取消后清理 stage、不写缓存、回到未生成态。

### 7.3 旁注选段两个静默坑

- **chip 发送后清除**：`sendAssistantMessage`（store:1198-1248）发送成功即清 `pendingSelection`（当前只在手动点 ✕ 时清除，下条消息会重复注入同一选段）。
- **选区监听收窄**：`ArticleAssistantPanel` 的 mouseup 监听从 document 级收窄到文章容器（`articleRef`）内；在聊天窗/导读栏里选中文字不再被当成文章选段。

### 7.4 searchError 可见

- 聊天窗顶部加可关闭提示条「网络搜索失败，本次回复未联网」。
- 数据已存在（`onArticleAssistantSearchDone` 的 `searchError: 'NO_RESULTS' | 'SEARCH_ERROR'`，store 已存），仅缺渲染；下次发送时清除。

## 8. E2E 补盲

| # | 用例 | 说明 |
|---|---|---|
| 1 | digest 历史删除 | 对齐 job 已有用例：删除模式 → 勾选 → 确认 → 文件与列表条目消失 |
| 2 | 缓存命中真验证 | digest/job mock 快路径加自增计数文件（`$E2E_CONFIG_DIR/briefing-mock-count`）；两次进入断言计数=1，真正区分缓存命中 vs 重新生成；同步修复 job「缓存复用」假绿用例 |
| 3 | digest 重试后成功 | 错误缓存 → 点重试 → 正常渲染（对齐 job 等价用例） |
| 4 | 标注跨重启恢复 | 创建标注 → `window.reload` → 重开文章 → 标记仍在 |
| 5 | 主题跨重启持久化 | 切 newspaper → 重启 → 仍 newspaper（复用字号持久化用例的 stopApp/startApp 模式） |
| 6 | 转入写作 | 见 §3 |
| 7 | 标注列表 | 见 §4 |
| 8 | 级联删除 | 见 §5 |
| 9 | 取消生成 | 触发生成 → 点取消 → stage 清理、无缓存文件 |
| 10 | 选段 chip 清除 | 选中 → 发送 → chip 消失；第二条消息请求体不含旧选段 |
| 11 | searchError 提示 | mock 返回 searchError → 提示条可见 |
| 12 | anthropic 隔离 | `anthropic-blog*.spec.ts` 中打真实网络的用例补 `@real` 标签，移出默认套件 |

**已在进行中的 2026-07-22 迭代覆盖、本轮不重复**：`.assistant.md` 损坏恢复（E7）、旁注文章上下文注入（E4）、标注注入聊天上下文（P1-3）。

## 9. 不纳入本轮

| 项 | 理由 |
|---|---|
| 求职卡片行动状态（⭐/✕/已投递） | 用户决定本轮不做 |
| 跨文章标注汇总/导出 | 用户明确「一篇文章的标注只在阅读这篇文章的时候看」 |
| 选段引用到写作 | 用户决策只做全文转入 |
| guide 内容 hash 失效 | 用户不会在有标注后重生成 digest |
| 求职「技能雷达」 | spec 从未定义过该功能，属 UI 文案误导，本轮只移除误导 |
| `insert_into_article` 确认/撤销 | 已记录为观察项，待用户反馈 |
| Anthropic 文章删除 UI | 该功能不存在，非本轮新增范围 |

## 10. 实施顺序建议

```
Phase 1（可靠性地基）: §7.1 错误区分 → §7.3 选段两坑 → §7.4 searchError
Phase 2（闭环功能）:   §3 转入写作 → §4 标注列表 → §5 级联删除
Phase 3（清理 + 取消）: §6 半截清理 → §7.2 生成取消
Phase 4（E2E）:        §8 全部（可随各 Phase 同步补）
```
