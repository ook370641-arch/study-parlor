# 封面画作裁剪（Crop on Cover）设计

日期：2026-10-07
状态：已批准（dev-only v1）

## 背景与目标

画作显示位置由 `focus`（CSS `object-position`）控制，目前只能通过 `scripts/curation-crop.cjs` 生成独立 HTML 工具调整，流程重（生成 → 导出 json → --apply）。目标：在封面上直接拖拽调整当前画作的焦点，封面实时联动，松手落盘。

**范围限定：dev 模式 only。** 打包版不显示入口（见「打包版分析」）。

## 数据链现状

```
Pictures/index.json  (事实源，focus 字段，git 纳管)
        │  dev 启动 / build 时
        ▼
src/assets/painting-manifest.json  (生成物，git 纳管，渲染进程静态 import)
        ▼
src/lib/paintings.ts → store.currentPaintings
        ▼
SurfaceBackground.tsx:85 / PaintingPlate.tsx:13  (objectPosition: focus ?? '50% 50%')
```

关键约束：渲染进程显示的是 manifest 快照，运行时改 index.json 不会自动反映到界面——必须同时更新内存 store（立即可见）+ 落盘 index.json（事实源）+ 重新生成 manifest（下次启动一致）。

## UI 入口与交互

- 封面右上角按钮组（换画 / 删除 / 记事板）新增**裁剪按钮**：crop 图标，复用 `swap-btn` 样式，`data-testid="cover-crop-button"`。仅当 `paintingsEditable && currentPaintings.cover` 时渲染。
- 点击展开**裁剪面板**：右上角下拉面板，样式对齐记事板面板（深底 + parchment 描边 + backdrop-blur）。
  - 原图完整缩略图（contain 适配面板宽度 ~360px）
  - 琥珀色裁剪框：框外压暗、三分线、`#d97757` 描边（视觉直接沿用 crop-tool.html 的约定）
  - 底部：焦点读数（如 `焦点 50% 30%`）+「重置」按钮（恢复 index.json 原值）
- **拖拽裁剪框**：拖动中实时换算 focus 并写入 store → 封面背景 `objectPosition` 同步联动；松手调 IPC 落盘。
- 关闭路径：再点按钮 / Esc / 点击面板外透明捕获层。
- 保存失败：面板内显示错误文案，store 不回滚（界面保留用户调整结果，事实源未变，下次启动回退）。

## 几何模块 `src/lib/crop-geometry.ts`

纯函数，搬运 crop-tool.html 的 object-cover 数学，独立可测：

- 输入：图片原始尺寸、面板缩略图尺寸、视口宽高（裁剪框宽高比 = 封面视口宽高比）
- 双向换算：`focusToRect(focus)` / `rectToFocus(rect)`，百分比取整，clamp 0-100
- 某轴无可裁剪余量（`rx`/`ry` 为 0）时该轴锁 50%
- 面板打开期间监听 window resize，重算裁剪框比例与位置

## 写回链路

### IPC（新文件 `electron/ipc/paintings.ts`）

- `paintings:canEdit() → boolean`：`!app.isPackaged` 且 `Pictures/index.json` 存在且可写。渲染进程 store 初始化时拉取，存 `paintingsEditable`。
- `paintings:setFocus(id, focus) → { ok: true } | { ok: false; error: string }`：
  1. 校验 `FOCUS_RE = /^\d{1,3}% \d{1,3}%$/`（与 curation-crop 一致）
  2. 读 `Pictures/index.json`，找到 id（未找到 → 报错）
  3. focus 为 `50% 50%` 时删除字段（与 curation-crop 的默认值约定一致），否则写入
  4. 写回 index.json，调 `vite-paintings-plugin.cjs` 的 `writeManifest()` 重新生成 manifest

### 渲染进程

- store 新增：`paintingsEditable: boolean`、`setPaintingFocus(surface, focus)`（不可变更新 `currentPaintings`）
- 拖拽中只动 store；松手才发 IPC。无并发问题（同一时刻最多一次拖拽）。

### dev 防整页 reload

`writeManifest()` 写 `src/assets/painting-manifest.json`，渲染进程静态 import 了它 → 触发 Vite reload、画作重洗牌。**防护**：该文件加入 renderer `server.watch.ignored`。安全性：dev server 每次启动（`configureServer`）和 build（`buildStart`）都重新生成 manifest，watch 忽略不影响正确性。

## 打包版分析（本版不实现，仅记录）

打包版障碍：画作库是构建产物（图片拷入安装目录、manifest 编译进 bundle），安装目录通常只读。支持打包版需 4 个模块：

| 模块 | 内容 |
|---|---|
| 画作库外置 | Pictures → 用户目录（如 `~/.studyparlor/Pictures`），首启从 bundled 资源播种拷贝；改 main bootstrap / app-paths |
| 运行时 manifest | 渲染进程从静态 import 改为启动时 IPC 拉取；改 paintings.ts / store / IPC |
| 图片服务协议 | 注册自定义协议从外置目录读图（带路径穿越防护）；改 main / SurfaceBackground / PaintingPlate / 预热 |
| 写回目标切换 | setFocus 写外置 index.json，刷新运行时 manifest 缓存 |

估计跨三层 8+ 文件 + electron-builder.yml + 打包冒烟。**结论：暂缓。** dev 调焦点 → git 提交 index.json → 重新打包，打包版经既有链路间接获得裁剪结果，不阻塞实际使用。等出现第二个"打包版需改画作库"的需求再一起做。

## 文件清单

- 新增 `src/lib/crop-geometry.ts`（纯函数）
- 新增 `src/components/PaintingCropButton.tsx`（按钮 + 面板一体，只导出组件）
- 新增 `electron/ipc/paintings.ts`（canEdit / setFocus）
- 修改 `src/pages/Cover.tsx`（按钮接入）
- 修改 `src/store/index.ts`（paintingsEditable / setPaintingFocus / init 拉取）
- 修改 `src/types/index.ts`（IpcApi 增加两条）
- 修改 `electron/preload.ts`（暴露）
- 修改 `electron/main.ts` 或 IPC 注册处（registerAllIpc 挂新域）
- 修改 `electron.vite.config.ts`（renderer watch.ignored 加 manifest）
- 新增 `tests/crop-geometry.test.ts`、`tests/paintings-ipc.test.ts`（临时目录 index.json）
- 修改 `e2e/source-map.json` + 封面 e2e spec（断言打包产物中裁剪按钮不存在）

## 测试与边界清单

- 单测：crop-geometry（极端宽高比、无余量轴锁 50、clamp 边界、往返换算一致）；setFocus 写回（默认值删字段、非法 focus 拒绝、未知 id 报错、index.json 不存在报错）
- 组件测试：面板开合（按钮/Esc/点外部）、拖拽联动 store、重置恢复原值、保存失败显示错误
- E2E：打包产物中断言 `cover-crop-button` 不存在（验证 dev-only 门控）
- 边界：无画作时按钮隐藏；拖拽中窗口 resize 裁剪框比例跟随；连续快速拖拽只在松手落盘

## 不做的事（YAGNI）

- 打包版支持（见上）
- 键盘微调、21:9 简报画框模式切换（crop-tool 有，封面场景用不上，需要时后补）
- 隐藏/恢复画作（已有删除按钮和 curation-crop 覆盖）
- focus 的 state.json 覆盖层（事实源保持 index.json 一家）
