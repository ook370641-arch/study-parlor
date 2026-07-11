# E2E 静默模式设计

> 目标：跑 E2E 测试时 Electron 主窗口不抢焦点、不遮挡当前活动窗口。

## 背景

当前 E2E fixture 手动 spawn Electron 主进程，主进程在 `electron/main.ts` 中无条件创建可见并最大化的 `BrowserWindow`。用户在玩游戏等操作时，测试窗口会跳到最前造成干扰。

## 方案

### 触发方式

新增环境变量 `E2E_SILENT=1`。主进程检测该变量后，以静默模式创建窗口。

不直接使用 `NODE_ENV=test` 判断，避免影响非窗口相关的测试逻辑。

### 主进程改动

在 `electron/main.ts` 中：

- 读取 `process.env.E2E_SILENT`。
- 当为 `'1'` 时：
  - `new BrowserWindow({ show: false, ... })`
  - 跳过 `mainWindow.maximize()`
  - 跳过 `mainWindow.focus()`
  - 确保没有自动 `show()` 的代码在静默模式下执行
- 正常模式下保持现有行为不变。

### E2E Fixture 改动

在 `e2e/fixtures/electron.ts` 的 spawn 环境变量中加入 `E2E_SILENT: '1'`，使所有 E2E 用例默认静默。

### 调试覆盖

保留通过 `E2E_DEBUG_VISIBLE=1` 临时禁用静默模式的能力，方便排查窗口相关测试失败。

## 验证

1. 跑一个最短 E2E smoke 用例，确认当前窗口不被遮挡。
2. 确认该用例通过（CDP 连接与页面交互正常）。
3. 确认 `npm run dev` 与打包后窗口行为不变。
4. 跑完整 E2E suite，确认无可见性相关回归。

## 风险与回退

- 风险：少量测试可能依赖窗口可见性（截图、视频、元素可见性断言）。
- 回退：从 fixture 中移除 `E2E_SILENT` 即可恢复现有行为。
