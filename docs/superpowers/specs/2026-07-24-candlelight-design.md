# 烛光随行（Candlelight）设计

日期：2026-07-24
状态：已批准（用户试用高保真原型后批准；开关为用户明确要求）
范围：夜航简报页四来源（digest / 求职 / Anthropic / 写作），仅 Academic 主题

## 1. 背景与目标

Academic 主题正文区遮罩压到 0.86–0.94 不透明度（`BriefingVeil.tsx`），画作——应用仅有的三个注册诗意资产之一——在用户停留时间最长的阅读区里不可见。页面断裂为「报头是画廊，正文是终端」。

烛光随行：光标携带一池暖光，光在遮罩之上、文字之下，以 `mix-blend-mode: screen` 做加法提亮。光照之处画作隐约透出；光标离开，光渐熄。不加一个词、一个控件（除用户明确要求的开关）。

目标：让画作资产从「报头 5% 时间可见」扩展到整个阅读会话；以零文字的非语言通道传达「应用回应你的注视」（波兰尼通道）。

已否决的替代方案：遮罩挖孔（CSS mask 全屏每帧重绘、画作颜色咬字风险不可控）、Canvas/WebGL（过度工程）。

## 2. 已批准的决策表

| 设计项 | 决策 |
|---|---|
| 技术路线 | screen 混合光层 + rAF 惯性跟随（原型参数：640px 层、lerp 0.11） |
| 生效范围 | 仅简报页；四来源全覆盖 |
| 主题 | 仅 Academic；Newspaper 主题光层不渲染，开关置灰 + title「Academic 主题下可用」 |
| 求职源配色 | 星蓝 `#7fa8d9` 烛光（例外主色，按 ui-styling §11 显式声明，与求职星图同色系） |
| 开关 | 左下角固定按钮，火焰 SVG glyph，`aria-pressed`，选择权留给用户 |
| 持久化 | `candlelightEnabled: boolean`，**默认开**，存 `state.json`；旧数据无字段 → 默认开 |
| 微光细节 | 静止 8 秒光渐弱熄灭，移动重燃（用户未否决，保留） |
| reduced-motion | 退化为无惯性直接跟随（保留光，去掉位移平滑） |

明确不做（YAGNI）：滚动光阶（已砍）、罩染肌理与照明排版（缓刑，二期再议）、home/study/cover 烛光（简报验证后回流）、Newspaper 主题烛光。

## 3. 组件架构

| # | 改动 | 文件 | 性质 |
|---|------|------|------|
| 1 | 新增 `CandlelightLayer` | `src/components/briefing/CandlelightLayer.tsx` | 光层 + 开关按钮同文件（组件文件只导出组件，ui-styling §10） |
| 2 | store 字段 | `src/store/index.ts` | `candlelightEnabled` + `toggleCandlelight()`；持久化 |
| 3 | 挂载 | `src/pages/Briefing.tsx` | 全局 Chrome：始终挂载、不受内容分支影响（ui-styling §8）；Academic 才渲染光层 |

### CandlelightLayer 行为规格

- 固定定位全屏层（`position: fixed; inset: 0`），`z-index` 介于遮罩（z-1）与内容（z-5）之间，`pointer-events: none`
- 光源：640×640px 径向渐变 div，screen 混合；两层渐变（外晕 + 内核），alpha ≤ 0.20（对比度红线）
- 跟随：`mousemove` 更新目标点；rAF 循环 `pos += (target - pos) * 0.11`（光比光标慢半拍）；只写 `transform`，不触发重排
- 首次 mousemove 淡入（opacity 0.45s）；`mouseleave`/窗口失焦渐熄；移动重燃
- 静止 8 秒渐熄（定时器 + opacity class），再移动重置定时器并重燃
- 求职源（`briefingSource === 'job-briefing'`）：渐变色值换星蓝 `#7fa8d9`，结构不变
- 开关按钮：左下角固定（`position: fixed; left/bottom`，避免与既有控件冲突，实现时核对最终坐标），内联 SVG 火焰 glyph，`aria-pressed`、`data-testid="briefing-candlelight-toggle"`；Newspaper 主题置灰 + `title` 说明
- 光层 `data-testid="briefing-candlelight"`

### store / 持久化

- `candlelightEnabled: boolean`，初始 `true`；`safe-json` 读入时缺字段回退 `true`（向后兼容，ipc-state 规则）
- `toggleCandlelight()` 切换并写入 `state.json`（复用既有持久化通道，无新增 IPC）

## 4. 边界行为清单（实现前冻结，ui-styling §7）

| # | 边界 | 行为 |
|---|---|---|
| 1 | 开关关闭 | 光层不渲染，按钮 `aria-pressed=false`；跨重启保持 |
| 2 | 主题切 Newspaper | 光层卸载、开关置灰；切回 Academic 按持久化状态恢复 |
| 3 | 求职源 | 光变星蓝，其余行为一致 |
| 4 | 鼠标离窗 / 窗口失焦 | 光渐熄，无残留定时器 |
| 5 | 快速切源 / 切日期 | 光层为页面级 chrome，不受影响、不重置 |
| 6 | 对比度红线 | 光 alpha ≤0.20、screen 混合、文字层恒在光层之上（z-index 契约） |
| 7 | 无鼠标（键盘用户） | 无光但无功能损失——纯氛围层 |
| 8 | `prefers-reduced-motion` | 无惯性直接跟随；渐熄/淡入 opacity 过渡保留（非位移） |
| 9 | 组件卸载（离开简报页） | rAF 循环与定时器全部清理，无泄漏 |

## 5. 测试策略

- **单元**：store 默认值（旧 state 无字段 → `true`）、`toggleCandlelight` 翻转并持久化
- **组件**：enabled 时 `[data-testid="briefing-candlelight"]` 挂载、禁用时卸载；按钮 `aria-pressed` 与点击行为；Newspaper 主题开关 `disabled`
- **E2E**（扩展现有 briefing specs）：
  - Academic digest 源默认可见 `briefing-candlelight`
  - 点击 `briefing-candlelight-toggle` → 光层消失 → `window.reload()` 后仍消失（持久化）
  - 求职源下光层存在且渐变色含 `#7fa8d9`（断言计算样式或 style 属性）
  - Newspaper 主题：光层不存在、开关置灰
  - `reducedMotion: 'reduce'` 跑一次：光层存在（只退惯性，不整层关闭）
- 验收核对：空数据/错误/加载三态下光层与开关行为一致（全局 chrome 解耦，ui-styling §8）；跨重启持久化

## 6. 交付顺序建议

1. store 字段 + 持久化 + 单元测试
2. CandlelightLayer 光层（无开关）+ 组件测试
3. 开关按钮 + Newspaper 置灰 + E2E 全链路
