# 前沿精选集 + 正文加长 设计

日期：2026-08-04
状态：已评审（头脑风暴五节全部确认）

## 背景与目标

夜航简报-前沿（digest）两项迭代：

1. **精选集**：日期列「今日」上方永久置顶一个「精选集」入口。导读生成后文章被切成若干块，每块铭牌行有「收入精选集」按钮。收藏条目 = 该块正文快照 + 导读对应块 + 旁注中归属该块的问答。收藏后继续聊该块产生的新问答自动追加进条目。
2. **正文加长**：当前摘要压缩过狠（博客 ~10,000 字符 → 200-400 词），用户零基础，需要更长正文。纯 prompt 改动。

**非目标（YAGNI）**：
- 精选集导出为 .md / 对外分享——不做
- Anthropic/拾贝来源的收藏——不做，仅前沿
- 精选集条目重排、排序设置——不做（固定按收藏时间倒序）
- 条目内问答的单条删除——不做（只有整条目移除）

## 已确认的决策（来自澄清问答）

- 旁注归属规则：消息 `selection` **向前填充**——带选段的消息开始，后续无选段消息沿用上一选段归属，直到新选段出现。
- 载体：结构化 JSON + 应用内渲染。
- 唯一性：同一 `(briefingFilePath, chunkIndex)` 最多一条；收藏后按钮变「已收藏」禁用。
- 收藏后新问答**自动追加**（live sync）。
- 收藏按钮位置：正文铭牌行（❧N）；仅前沿源显示。
- 条目管理：可移除（移除后按钮恢复可点）；新收藏在前。
- 架构：方案 A 副本式——收藏时拷贝块内容进精选集，源简报删除后条目仍完整可读。
- 正文加长：显著加长（博客 600-900 词 / 播客 800-1200 词 / 推文 6-10 句）。

## 数据模型与存储

存储位置：`<学习库>/夜航简报/精选集.json`（与每日简报同目录；该目录已被 `files:scan` 排除，`.json` 不被 `.md` 扫描命中，点亮灯火不受影响）。

```jsonc
{
  "version": 1,                    // 数据版本，格式变更时作废旧文件（ipc-state §12）
  "entries": [
    {
      "id": "c-<时间戳>-<短随机>",
      "briefingFilePath": "<学习库>/夜航简报/夜航简报-2026-08-04.md",
      "briefingDate": "2026-08-04",
      "chunkHeading": "OpenAI News",
      "chunkIndex": 2,              // guide.chunks 下标（preamble 不计）
      "chunkBody": "<收藏时该块 markdown 正文快照>",
      "guide": {
        "summary": "...",
        "terms": [{ "term": "...", "translation": "...", "explanation": "..." }]
      },
      "qa": [
        { "role": "user", "content": "...", "selection": "..." },
        { "role": "assistant", "content": "..." }
      ],
      "qaMessageCount": 6,          // 已同步的源会话消息数（增量游标）
      "collectedAt": "2026-08-04T...",
      "updatedAt": "2026-08-04T..."
    }
  ]
}
```

- `chunkBody`/`guide` 为收藏时刻快照，之后不随源文件变化。
- `qaMessageCount` 增量游标：每次同步只处理源会话中游标之后的消息，幂等。
- 类型定义放 `src/types/index.ts`（`BriefingCollection` / `BriefingCollectionEntry` / `BriefingCollectionQA`）。

## 归属算法与同步时机

**归属算法**（渲染进程纯函数，`src/lib/collection-attribution.ts`，可单测）：

```
attributeMessages(messages, articleContent, guideChunks) → Map<chunkIndex, ArticleAssistantMessage[]>
```

1. 遍历旁注会话消息，维护 `currentSelection`：遇带 `selection` 的 user 消息即更新（向前填充）。
2. 每条消息归属 = `currentSelection` 落在哪个 chunk：用 `splitArticleIntoChunks` 切正文后按 `chunk.body.includes(selection)` 匹配。
3. 从未带 selection 的消息不归属任何块，不进精选集。
4. selection 匹配不到任何 chunk（正文已变/跨块选段）→ 该段消息丢弃，不报错。

**同步时机（两个）**：

- **收藏时**：快照 chunk 正文 + 导读块，全量计算一次归属填入 `qa`，记 `qaMessageCount` = 当前会话消息总数。
- **增量追加**：只挂在 `finishAssistantStreaming`（`src/store/index.ts:1888`）——**答案完整生成后才追加**。若当前文章有已收藏条目，取游标后的新消息重算归属，append 到对应条目并推进游标。
  - 明确不挂在 `abortAssistantStream` / `persistAssistantState`：半截答案不立即进精选集；若该消息留在会话中，下次正常完成时由游标补算收入（自愈合）。

**主进程 IPC**（4 个薄接口，只读写 JSON，无业务逻辑；按 ipc-state §1 四层同步）：

| IPC | 作用 |
|---|---|
| `collection:read` | 读整个精选集（损坏时备份 `.bak` 并返回空集合，复用 safe-json 模式） |
| `collection:addEntry` | 新增条目（`(filePath, chunkIndex)` 去重） |
| `collection:removeEntry` | 按 id 移除 |
| `collection:appendQA` | 按 id 追加问答 + 推进 `qaMessageCount` |

写盘用 tmp + rename 原子写（沿用 briefing.ts 模式）。

## UI

**① 日期列置顶入口**（`BriefingDateColumn`，仅 digest 源）

- 「今日」上方固定「✦ 精选集」，不参与日期排序，无火焰灯，右键删除菜单不适用。
- 收起态在「今」按钮上方放「✦」小按钮。
- testid：`briefing-collection-entry` / `briefing-collection-mini`（UI 出口 e2e 断言，feature-development §12）。

**② 正文铭牌收藏按钮**（`ArticleBodyChunks` 铭牌行右侧）

- 未收藏：`☆ 收入精选集`；点击 → `★ 已收藏`（禁用态）。
- 通过 prop 开关（如 `collectible`），仅 digest 阅读器传入；Anthropic/拾贝共用组件默认关闭。
- 依赖导读已生成（chunk 边界来自导读 heading）；导读未生成/失败时按钮不渲染。
- testid：`chunk-collect-button-{chunkIndex}`。

**③ 精选集阅读页**（新组件 `CollectionView`，替换主区 reader）

- 条目按 `collectedAt` 倒序，按简报日期分组，组头如「8月4日 夜航简报」。
- 每条目一张卡片，三段式：
  1. 正文快照：块标题 + `chunkBody` 完整 markdown（复用 `MarkdownRenderer`）
  2. 导读：summary + 术语表（沿用 GuideSidebar 视觉语言）
  3. 旁注问答：问答气泡流（复用 `assistantMdComponents`），带 selection 的 user 消息显示引用条
- 每卡片右上角「移出精选集」（ConfirmDialog）。
- 空态：「尚无收藏。阅读今日简报时，点块标题旁的 ☆ 收入精选集。」
- 全局 chrome（背景插画、换画、字号、双版式）常驻（ui-styling §8/§9）。

## 正文加长（prompt-only）

只改 `electron/prompts/briefing/` 三个文件：

| 文件 | 当前 | 改为 |
|---|---|---|
| `summarize-blogs.md` | 200-400 words | 600-900 words；关键技术名词首次出现给一句通俗解释 |
| `summarize-podcast.md` | 300-500 words | 800-1200 words；同上 |
| `summarize-tweets.md` | 3-5 sentences | 6-10 sentences；补全推文上下文背景 |

`digest-intro.md` / `translate.md` 不改。代价：输出 token 约 ×3，生成耗时增加；缓存机制不变。

## 错误处理与兼容

- `精选集.json` 缺失 → 空集合，无需迁移；损坏 → 备份 `.bak` + 空集合，入口可用。
- 收藏时源简报已删除 → 快照来自 store 内存中的文章内容，不二次读盘。
- 增量追加写盘失败 → 静默降级，游标未推进，下次 `finishAssistantStreaming` 重试（幂等）。
- 删除某日简报 → 精选集条目保留（副本式核心语义），问答不再增长。
- state.json 无新增字段（精选集是数据不是设置）。

## 测试策略

定向测试，不跑全量。

- **单元**：
  - `attributeMessages`：向前填充 / 无 selection 不收 / 换 selection 换归属 / 匹配不到 chunk 丢弃 / 空消息流
  - 精选集 JSON 读写：损坏备份、version 失效、addEntry 去重、appendQA 游标幂等
  - `tests/prompts.test.ts` 若有字数断言则同步更新
- **组件**：铭牌按钮三态（未收藏/已收藏/导读未生成不渲染）；日期列置顶项；CollectionView 分组/空态/移除确认
- **E2E**（新 spec + `e2e/source-map.json` 新 group，mock briefing + mock 旁注 LLM）完整生命周期：
  1. 生成今日简报 → 导读生成
  2. 日期列断言「精选集」置顶入口
  3. 拖拽文本（`__e2e_triggerGhostPen`）→ 旁注提问完成 → 铭牌收藏 → 变「已收藏」禁用
  4. 打开精选集 → 断言条目三段（正文/导读/问答）
  5. 追问（无新 selection）→ 完成后断言追加进原条目（向前填充）
  6. 带新 selection 聊另一块 → 断言归属切换
  7. abort 半截回答 → 断言不追加
  8. 移除条目 → 按钮恢复可点
  9. 重启 → 精选集内容仍在
  10. 删除该日简报 → 条目仍完整可读

## 验收清单

- [ ] 空数据：无 `精选集.json` 时入口在、空态正确
- [ ] 归属：向前填充、换 selection 换归属、无 selection 不收、匹配失败丢弃
- [ ] 追加时机：仅完整回答后追加；abort 不追加
- [ ] 唯一性：同块重复收藏被去重，按钮禁用
- [ ] 移除：条目移除后按钮恢复可点，重收藏重新快照
- [ ] 源删除兼容：删除简报后条目完整可读
- [ ] 跨重启持久化
- [ ] 点亮灯火：`精选集.json` 不出现在首页与推荐逻辑
- [ ] 双版式：academic/newspaper 配色均正确
- [ ] UI 出口：`briefing-collection-entry`、`chunk-collect-button-*` 在 e2e 断言中渲染
- [ ] 正文加长：新 prompt 生效（手动生成一次真实简报抽查长度）
