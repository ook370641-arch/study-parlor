# 简报后台生成设计：生成中可自由切换日期与来源

日期：2026-08-01
状态：已实现（本文档为 E2E 用例溯源依据，e2e.md §2）

## 问题

夜航简报页生成「求职」/「前沿」今日简报期间，日期列点击无效。根因：store 的
`generateBriefing`/`generateJobBriefing` 以 `loading` 作互斥锁，查看往期日期（IPC 缓存命中）
与真实生成共用同一 action，生成期间一切点击被吞；`loading` 同时驱动全屏生成仪式视图。

## 目标行为

1. 今日点「查收」才生成；生成在后台继续，不占用视图。
2. 生成中可点击任意其他日期查看已有简报（缓存读），可切换任意来源。
3. 切回生成中的日期 → 实时进度星图（不重演收束仪式）。
4. 完成时正在观看该日期 → 播放收束仪式并以 fresh 抵达展示；完成时不在观看 →
   不抢占视图，仅刷新历史列表并点亮当日火焰（无 toast）。
5. 生成失败：错误记入生成记录；切回该日期冷展示错误面板（不重演 failing 动画）；
   「重试」以 force 重新生成当前观看日期。

## 设计要点

- store 新增纯内存字段：`briefingViewingDate` / `jobBriefingViewingDate`（null = 今天）、
  `briefingGeneration` / `jobBriefingGeneration`（`{date, status: 'running'|'failed', error, confirmed}`）。
  视图桶 `briefing`/`jobBriefing` 形状不变，语义变为纯视图。
- 真实生成只发生在今天（或 force 重试），登记生成记录并订阅进度；历史日期是缓存读，
  不登记记录、不订阅进度。"今日已生成再点今日"会投机登记记录，缓存命中返回时清除。
- `confirmed`：收到首个真实进度事件才置真。页面的"观看生成中"（仪式触发）以
  confirmed 为准——缓存读的投机登记不会让用户看到星图/抵达动画（保持 revisit 语义）。
- 完成判定以 IPC 返回的 `cached === false` 为权威；`requestId` 只保护视图不被迟到的
  缓存读覆盖，后台生成完成/失败的处理不受 requestId 丢弃（否则切过日期的生成永不收场）。
- `briefing:progress` 事件加 source（`'digest' | 'job'`）；preload 改 per-handler
  `on`/`off`（修复 removeAllListeners 互相残杀的存量 bug）。
- `useGenerationTransition` 的 key 重置清 `wasLoading`；仪式 hook 改喂「观看生成中」
  标志而非桶 loading，缓存查看不触发仪式（保持 revisit 语义）。

## 验收清单（E2E 用例溯源）

| # | 用例 | 预期 |
|---|---|---|
| 1 | digest 生成中点击 seed 的历史日期 | 历史内容可见（revisit），生成记录不受影响 |
| 2 | 随后点回「今日」 | 星图进度重新可见；生成完成后 reading pane `data-arrival="fresh"` |
| 3 | digest 生成中切到求职源再切回 | 求职空态可见；切回后星图仍在（进度未丢） |
| 4 | 完成时正在看历史日期 | 视图不被抢占；今日火焰变 `lit`；点击今日 → `revisit` 展示缓存 |
| 5 | 求职源镜像：生成中切换历史日期再切回 | 同 1-2（job reading pane fresh） |

边界（单测覆盖）：生成中取消、失败记录冷展示 + force 重试、快速连点 stale 丢弃、
跨域进度不串扰、今日已生成再点今日（投机记录清除）。

## Mock 策略

默认链路走主进程 E2E mock fast path（`E2E_BRIEFING_MOCK_DELAY_MS` /
`E2E_JOB_BRIEFING_MOCK_DELAY_MS` 拉长生成窗口至 1.5s，使切换动作落在生成中）。
历史日期用 `seedBriefing` / `seedJobBriefing` 预置缓存文件。
