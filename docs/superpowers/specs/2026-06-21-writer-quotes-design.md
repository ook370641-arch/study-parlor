# 作家语录设计文档

**日期**：2026-06-21  
**功能**：在封面和主页随机展示精选作家句子。  
**状态**：待实现  
**相关文档**：[[2026-06-21-night-briefing-design]]（同批次视觉/体验优化）

## 1. 目标与体验

打开应用时，用户在封面右下角和主页学习库底部各看到一句精选作家语录。语录应像画框角落的题签：可见、有质感，但不打扰核心操作。

- **刷新频率**：每次进入对应页面时各自随机；点击小 ↻ 按钮可手动换一句。
- **两页独立**：封面和主页的语录各自随机，互不影响。
- **情绪定位**：暗色画作背景上的浅色衬线文字，带柔和 text-shadow，营造“偶尔被击中”的氛围。

## 2. 布局方案

基于用户真实截图复刻后的最终决定：

| 页面 | 位置 | 对齐 | 说明 |
|------|------|------|------|
| Cover | 右下角空白处 | 右对齐 | 与左下角“迷路了吗，K / 点亮灯火”形成对角平衡 |
| Home | 学习库面板最底部 | 居中对齐 | 作为学习库列表的视觉收尾，不占用侧栏空间 |

视觉参考保存在 `.superpowers/brainstorm/1605-1782051760/content/quote-layouts-v4.html`。

## 3. 数据模型

新建 `src/lib/quotes.ts`：

```ts
export type Quote = {
  id: string
  text: string        // 中文译文（必填）
  original?: string   // 原文（可选，为后续双语展示预留）
  author: string      // 作家中文名（必填）
  authorOriginal?: string
  source?: string     // 出处（可选）
}

export const quotes: Quote[] = [
  {
    id: 'blanchot-01',
    text: '写作，就是走向那个永不到来的终点。',
    original: "Écrire, c'est cheminer vers ce point où l'on n'arrive jamais.",
    author: '莫里斯·布朗肖',
    authorOriginal: 'Maurice Blanchot',
  },
  // ...
]
```

首版作家池（8 位，约 2–3 句/人）：

- 莫里斯·布朗肖
- 弗兰茨·卡夫卡
- 豪尔赫·路易斯·博尔赫斯
- 伊塔洛·卡尔维诺
- 费尔南多·佩索阿
- 赖内·马利亚·里尔克
- 瓦尔特·本雅明
- 汪曾祺（中文作家，提供中文语感对照）

## 4. 组件设计

### 4.1 `src/components/Quote.tsx`

```tsx
type Props = {
  surface: 'cover' | 'home'
}
```

行为：

1. 组件挂载时从 `quotes` 中随机选一条作为当前展示。
2. 渲染中文 `text` + `author`。
3. hover 时显示右下角 ↻ 按钮；点击后重新随机。
4. 不显示 `original`、`source` 等预留字段。

样式（与现有设计体系一致）：

- 字体：`font-serif`（Source Han Serif SC / Georgia）
- 颜色：`text-parchment/80`
- 阴影：`text-shadow: 0 1px 6px rgba(0,0,0,0.65)`
- 作家名：`font-sans`，`text-parchment/55`，字号比正文小一号
- 刷新按钮：默认透明，hover 时显示为 `text-parchment/40 hover:text-ember`

### 4.2 页面集成

- `src/pages/Cover.tsx`：在左下角 CTA 区域右侧/下方插入 `<Quote surface="cover" />`。
- `src/pages/Home.tsx`：在学习库面板（右侧 flex-1 列）最底部、`StudyLibrary` 之后插入 `<Quote surface="home" />`。

两处均不引入新的 z-index 层级冲突，保持 `z-[5]` 以内。

## 5. 行为规则

- **随机算法**：`quotes[Math.floor(Math.random() * quotes.length)]`，允许重复命中。
- **手动刷新**：触发后组件重新随机，不保证与上一次不同。
- **生命周期**：不持久化，页面卸载、应用关闭后重置。
- **无 store 改动**：本次实现为纯渲染进程本地状态，符合方案 1 的约定。
- **不进入 Study 页**：首版不在学习对话页面展示语录，避免干扰苏格拉底式对话流。

## 6. 边界情况

- `quotes` 为空数组：组件渲染为空，不抛错。
- 极长语录：正文最多显示 3 行，超出部分截断（`line-clamp-3` 或等效 CSS），避免挤压布局。
- 窄窗口：Cover 右下角语录在过窄时自动换行；Home 底部语录保持左右留白。

## 7. 测试

新增 `tests/quotes.test.ts`：

- 验证 `quotes` 非空。
- 验证每条语录都有 `id`、`text`、`author`。
- 验证 `id` 唯一。
- 验证随机选择函数在多次调用中覆盖数组下标范围（允许概率性，可用 seed 或多次循环）。

新增 `tests/components/Quote.test.tsx`（可选）：

- 渲染后可见 `text` 和 `author`。
- 点击刷新按钮后内容可能变化（概率性断言，多次点击）。

## 8. 明确不做

- 不将语录加入设置页编辑。
- 不持久化用户偏好或“今日语录”。
- 不调用 LLM 生成语录。
- 不在 Study、Profile、Settings、Extension 等页面展示。
- 首版不显示原文/出处字段。

## 9. 实现文件清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/lib/quotes.ts` | 新增 | 语录类型与精选库 |
| `src/components/Quote.tsx` | 新增 | 语录展示组件 |
| `src/pages/Cover.tsx` | 修改 | 插入封面语录 |
| `src/pages/Home.tsx` | 修改 | 插入主页语录 |
| `tests/quotes.test.ts` | 新增 | 语录数据测试 |
| `tests/components/Quote.test.tsx` | 可选新增 | 组件测试 |

## 10. 验收标准

- [ ] 打开应用，封面右下角可见一句作家语录。
- [ ] 进入主页，学习库底部可见另一句作家语录（可与封面不同）。
- [ ] 鼠标 hover 语录时出现 ↻ 按钮，点击后该页面语录刷新。
- [ ] 关闭再打开应用，两页语录重新随机。
- [ ] `npm run test` 中新增测试全部通过。
- [ ] 不引入 TypeScript 类型错误或 UI 层级异常。
