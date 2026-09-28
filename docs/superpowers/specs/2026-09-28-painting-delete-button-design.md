# 封面画作删除按钮 · 设计（B2 画作替换 · 独立功能线）

> 日期：2026-09-28
> 状态：已与用户对齐，随勾选工具线并行实施
> 与勾选工具线（2026-09-28-paintings-collection-design.md）互不依赖，单独交付

## 目标

封面页提供一个删除按钮，用于长期管理画作库：点击即将当前展示的画作从抽取池中永久隐藏，并自动换到下一幅。

## 关键决策（用户已确认）

- **隐藏名单，非物理删除**：打包后画作在 asar 内只读，物理删除不可行。删除 = 画作 id 写入 `state.json` 的 `hiddenPaintings`，永久不再被抽中。可逆（手改 state.json；恢复 UI 显式 deferred）
- **无确认弹窗**：单个按钮，点击即生效
- **位置**：封面页换画按钮右侧，仅封面出现（home/study/briefing 不出）
- **设置开关**：Settings 页放勾选项「封面显示画作删除按钮」，控制按钮是否出现；持久化字段 `paintingDeleteEnabled: boolean`，默认 `true`（功能是用户点名要的，默认开）

## 改动点

### 数据层

- `state.json` 新增 `hiddenPaintings: string[]`（默认 `[]`）、`paintingDeleteEnabled: boolean`（默认 `true`）——旧 state 兼容：读取时缺省补默认值
- `Painting.painter` 字面量联合放宽为 `string`（若勾选工具线先落地则此处不再重复改；两线共用这一处类型改动，谁先落地谁改）

### Store

- 新增 `hiddenPaintings: string[]`、`paintingDeleteEnabled: boolean` 到 store 状态与持久化通道（沿用现有 state IPC patch 模式）
- 新增 `hidePainting(surface)`：把 `currentPaintings[surface].id` 追加进 hiddenPaintings（去重）、持久化、随后对该 surface 执行换画
- `initPaintings` / `swapPainting` 抽取池 = `manifest.filter(p => !hidden.has(p.id))`
- 兜底：池空时 `pickRandom` 已返回 null；`SurfaceBackground` 有 vignette 纯底兜底；hidden 中含已不存在于 manifest 的 id 无害

### UI

- 新组件 `src/components/DeletePaintingButton.tsx`（垃圾桶图标，`aria-label="移出库"`，`data-testid="painting-delete-button"`）
- `Cover.tsx`：仅当 `paintingDeleteEnabled` 时，在 `SwapPaintingButton` 右侧渲染；与展签同 group hover 显现协议（视觉协议一致）
- Settings 页：新增勾选项「封面显示画作删除按钮」（`data-testid` 必备），即时持久化

## 测试

- 单元：hidden 过滤抽取池、hidePainting 去重 + 持久化、池空兜底、`paintingDeleteEnabled` 默认值与旧 state 兼容
- 组件：按钮在开关开/关下的显隐、点击后触发 hidePainting
- E2E：封面删除 → 自动换画；重启后该画不再出现；设置开关关闭后按钮消失。同步 `e2e/source-map.json`（painting 组）

## 不做（YAGNI）

- 不做恢复 UI（手改 state.json）
- 不做确认弹窗、不做撤销 toast
- 不在 home/study/briefing 提供删除按钮
