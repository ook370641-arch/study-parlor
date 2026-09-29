# 阅读位置持久化修复 + 对照持久化 + 对照分隔线按钮 设计

日期:2026-09-29
状态:已确认(用户口头批准,落盘时机按「退出时持久化」调整)

## 背景

1. 博客阅读位置记忆(2026-09-22 提交 `370d157`)实际不生效:文章能自动重开,但位置总是回顶部。
2. 博客对照文(`articleCompanionMap`)已持久化映射,但重启后不恢复对照槽,对照编辑器无位置记忆。
3. 两个对照编辑器(写作页 `CompanionBoard`、博客 `ArticleCompanionBoard`)没有分隔线按钮——主工具栏的 `insertHrBelow` 走全局单槽 `writingEditorAction`,对照实例 `registerToolbarAction={false}` 够不到。

用户附加约束(2026-09-29):**阅读位置改为退出时持久化**,不要滚动全程 `set + patchState`(现状每次滚动停 400ms 就写一次磁盘)。

## 功能 1:博客阅读位置修复

### 根因

`AnthropicArticleReader` 把 `<article ref={articleBodyRef}>` 当块容器,但其直接子元素只有 1 个(`ArticleBodyChunks` 的包裹 div;真正 markdown 块在每个 chunk 的 `.md-body` 内,隔三层)。`firstVisibleBlockIndex` 对单子元素恒返回 0 → 存 0 → 恢复时 `saved <= 0` 跳过 → 回顶部。写作页未踩坑因其 blocksRoot 是 `.ProseMirror`(直接子元素即块)。

### 修法

- `src/lib/scroll-memory.ts`:两个函数的 `blocksRoot: HTMLElement` 参数放宽为 `blocks: ArrayLike<Element>`(HTMLCollection / NodeList / 数组均兼容)。WritingBoard 传 `pm.children` 不受影响。
- `AnthropicArticleReader`:块集合改为 `articleEl.querySelectorAll('.md-body > *')`——跨章节全局块索引,粒度细于原设计。
- 补守卫:滚动防抖窗内切了文章则丢弃本次保存(读 `useStore.getState().anthropicReaderFilePath` 比对),与 WritingBoard 对 `writingFile?.path` 的守卫同款。

## 功能 1.5:位置持久化改为「退出时落盘」(写作 + 博客 + 对照三处统一)

现状:`setWritingScrollPosition` / `setAnthropicScrollPosition` 在滚动停 400ms 时 `set + patchState`,全程写盘。

改为:

- 滚动停 400ms 只算好首可见块索引存 **组件内 ref**(不进 store、不 IPC)。
- 落盘(读 ref → `set` store → 一次 `patchState`)只发生在三个时机:
  1. **切换文章/文件**:effect 以 `scrollMemoryKey` / `file.filePath` 为依赖,cleanup 时落盘旧 key(DOM 仍在,但直接用 ref 值,不依赖 DOM 测量时机);
  2. **离开页面/组件卸载**:同一 cleanup 覆盖;
  3. **窗口关闭**:`window` `beforeunload` 监听里 fire-and-forget `void ipc.patchState(...)`(主进程存活,invoke 消息随 close 前发出即可落盘,不等回包)。
- store 侧:`setWritingScrollPosition` / `setAnthropicScrollPosition` 移除内部 `patchState`,仅 `set`;新增 `flushWritingScrollPosition` / `flushAnthropicScrollPosition` / `flushArticleCompanionScrollPosition`(set + 一次 patchState 整个 map)供退出点调用。
- 用户从未滚动(ref 为空)→ 退出不写,保留旧值。
- 崩溃(无 beforeunload)丢失自上次退出点以来的位置,可接受。

## 功能 2:博客对照文持久化 + 位置

### 对照槽恢复

- state.json 新增 `lastArticleCompanion: { mainKey: string; filePath: string } | null`:
  - `selectArticleCompanion` 读文件成功时写入;
  - `closeArticleCompanion`(✕)时清 null —— **明确关掉的对照不会被重新拉开**(与主文 `restoredRef` 语义对齐);
  - 对照文件外部删除导致 select 失败清 map 时,若匹配则一并清掉。
- `AnthropicBlogPanel` 恢复 effect:恢复主文后,若 `lastArticleCompanion.mainKey === 恢复的主文路径` → 自动 `selectArticleCompanion('anthropic', main, filePath)`;面板折叠时不强制展开,对照 tab 的显隐跟随已持久化的 `articlePanelMode`。

### 对照滚动位置

- state.json 新增 `articleCompanionScrollPositions: Record<string, number>`(filePath → 首可见块索引)。
- `ArticleCompanionBoard`:md 可编辑态接 WritingBoard 同款模式——滚动容器 ref + `.ProseMirror` 块集合;恢复用 50ms 轮询(最多 ~2s)等编辑器建块;保存/落盘按功能 1.5 的退出时机制。
- 仅 `kind === 'md'` 生效;html(iframe)/只读预览不做位置记忆。

### 三层同步(ipc-state §3)

`src/types/index.ts` StateJson → `electron/ipc/state.ts` DEFAULT → store init/seed → `e2e/helpers/test-library.ts` BASE_STATE,全部给两个新字段默认值,兼容旧 state.json。

## 功能 3:对照编辑器分隔线按钮

- `insertHrBelow` 从 `WritingToolbar.tsx` 原样抽到 `src/lib/milkdown-insert-hr.ts`(组件文件只导出组件,ui-styling §10);`WritingToolbar` 改 import。
- `WritingEditor` 新增可选 prop `registerLocalAction?: (action: ((fn: (ctx: any) => void) => void) | null) => void`:加载完成即回调 action,卸载/重建回调 null;与全局单槽逻辑正交(`registerToolbarAction={false}` 的对照实例也走)。
- `CompanionBoard`(写作页)与 `ArticleCompanionBoard`(博客页)头部文件名右侧各加一个分隔线按钮:
  - 复用 `HrIcon`;`onMouseDown preventDefault` 保持编辑器选区;
  - 仅 md 可编辑态显示(`ArticleCompanionBoard` 的 readonly/html 分支不显示);
  - testid:`companion-insert-hr` / `article-companion-insert-hr`;
  - 失败(代码块内等守卫拦截)时 toast/hint 复用现有「当前位置不支持该操作」语义,用按钮旁临时小字。

## 验收清单

功能 1/1.5:
- [ ] 博客文章滚到中部 → 切到别的文章 → 切回:位置恢复;
- [ ] 滚到中部 → 离开博客页再进入:恢复;
- [ ] 滚到中部 → 重启应用:恢复(state.json 有值且重开后滚动到位);
- [ ] 滚动过程中不再每次停 400ms 写 state.json(文件 mtime 只在退出点变化);
- [ ] 快速切文章(400ms 防抖窗内)不把新文章位置写进旧 key;
- [ ] 单章节(无 heading)文章也能恢复非顶位置(原 bug 场景)。

功能 2:
- [ ] 对照开着 → 重启 → 进博客页:主文 + 对照文都恢复,对照滚动位置恢复;
- [ ] 对照 ✕ 关掉 → 重启:不自动重开;
- [ ] 对照文件被外部删除 → 重启:静默跳过且清掉持久化记录;
- [ ] 旧 state.json(无两新字段)启动不报错。

功能 3:
- [ ] 两个对照编辑器点按钮:光标处插入分隔线,光标落到分隔线下一行(与主工具栏行为一致);
- [ ] 代码块内点击:不插入 + 提示;
- [ ] 按钮出现在至少一个 e2e 断言中(feature-development §12)。

## 测试计划

- 单测:`tests/scroll-memory.test.ts` 补 `ArrayLike<Element>`(NodeList/数组)用例;现有用例适配签名。
- E2E(定向,不跑全量):
  - 新增 `e2e/specs/blog-reading-position.spec.ts`(滚动恢复 / 退出落盘 / 切换文章守卫),进 `e2e/source-map.json` 对应 blog group;
  - 对照恢复+位置并入该 spec 或 `writing-companion-pane.spec.ts` 就近扩展;
  - hr 按钮:`writing-companion-pane.spec.ts` + 文章对照所在 spec 各加断言;
  - `e2e/helpers/test-library.ts` BASE_STATE 加两新字段。
- 验证命令:`npx vitest run tests/scroll-memory.test.ts` + `node scripts/e2e-changed.js --run --no-retries`。
