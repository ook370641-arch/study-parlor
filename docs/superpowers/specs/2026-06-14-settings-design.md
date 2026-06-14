# 设置页设计：仪器调校

## 1. 背景与目标

学者夜话目前把 API 配置（Key / Base URL / Model）和学习库目录写在项目根目录的 `.env` 文件里。首次启动时通过 `SetupWizard` 引导用户配置，但配置完成后没有 UI 入口可以再次修改。用户必须手动编辑 `.env`。

本设计的目标是在应用内增加一个**设置页**，让用户能够：
- 查看并修改当前 AI 服务配置；
- 查看并修改学习库目录；
- 验证 API Key 是否有效；
- 保存后明确知道需要重启应用才能生效。

## 2. 范围

**在范围内：**
- 主页右上角新增"设置"入口；
- 独立的"设置"页面；
- 可编辑字段：API Key、Base URL、Model、学习库目录；
- API Key 实时探活验证；
- 把配置写回 `.env` 文件；
- 保存后提示用户手动重启。

**不在范围内：**
- 修改 profile（昵称 / 简介 / 话题 / 难度 / 腔调）—— 已在"卷宗"页；
- 自动重启应用；
- 学习库文件迁移；
- 运行时热重载配置。

## 3. 设计方案

### 3.1 主页入口

右上角按钮从左到右排列为：

```
[🖼️ 换画图标] [设置] [卷宗] [扩展]
```

- "换画"保持现有的图标按钮样式（`SwapPaintingButton`），不改为文字。
- "设置"是新增的文字按钮，紧挨"卷宗"左侧。
- "卷宗"和"扩展"保持现有位置与样式。
- 总数为四个按钮，符合"不超过四按钮"的约束。

点击"设置"后，通过 `goto('settings')` 进入独立设置页。

### 3.2 设置页整体结构

设置页为全屏浮层，与 `Profile`、`Extension` 保持一致：

- 根容器：`fixed inset-0`，背景使用 `SurfaceBackground surface="home"`。
- 内容区：`absolute top-10 left-6 right-6 bottom-5 z-10`，内部最大宽度 `max-w-3xl mx-auto`。
- 顶部标题栏：左侧标题"设置 · 仪器调校"，右侧"返回夜话"按钮。
- 主体：垂直堆叠的卡片，使用与 `Extension` 相同的卡片风格（`bg-parchment/5 border border-slate/20 rounded-lg p-4`）。

### 3.3 卡片一：AI 服务（默认展开）

这是用户进入设置页后默认看到的第一个卡片。

包含三个字段：

| 字段 | 类型 | 默认值来源 |
|------|------|-----------|
| API Key | password input + 显示/隐藏切换 | 当前 `.env` 的 `KIMI_API_KEY` |
| Base URL | text input | 当前 `.env` 的 `KIMI_BASE_URL`，fallback 为 `https://api.kimi.com/coding/v1` |
| Model | text input | 当前 `.env` 的 `KIMI_MODEL`，fallback 为 `kimi-k2.6` |

**验证：**
- 卡片底部有独立按钮"验证连接"。
- 点击后调用与 `SetupWizard` 相同的 `setupProbeKey` IPC，传入当前三个字段值。
- 验证状态显示在按钮右侧：`从未验证` / `验证中...` / `连接正常` / `失败：具体原因`。
- 验证失败不阻塞保存。
- API Key 为空时，"验证连接"和"保存"按钮禁用。

### 3.4 卡片二：学习库

包含一个路径输入框和"选择目录"按钮：

- 路径文本框显示当前 `STUDY_LIBRARY_PATH`。
- "选择目录"调用 `setupSelectDirectory` 打开系统目录选择对话框。
- 用户选择后更新文本框值。
- 路径为空时禁用"保存"。

### 3.5 保存、作废与重启提示

- **保存**：将当前表单值写回 `.env` 文件。成功后显示 toast：`配置已保存，重启后生效`。
- **作废**：将表单重置为进入页面时读取到的当前配置，不二次确认。
- **重启**：不自动重启。在保存按钮下方常驻一句提示："保存后需重启应用，改动才会生效。"

## 4. 数据流与架构

### 4.1 IPC 新增与复用

复用现有 IPC：
- `setupProbeKey(args)` —— API Key 探活验证。
- `setupSelectDirectory()` —— 目录选择对话框。

新增 IPC：
- `getConfig: () => Promise<AppConfig>` —— 主进程读取当前 `.env` 配置返回给渲染进程。
- `writeConfig: (config: AppConfig) => Promise<void>` —— 主进程将配置写回 `.env`。

```ts
// AppConfig 已定义于 electron/env.ts
export type AppConfig = {
  apiKey: string
  baseUrl: string
  model: string
  libraryPath: string
}
```

### 4.2 主进程实现

在 `electron/env.ts` 中新增 `saveEnv(config: AppConfig): void`：

- 将四个字段序列化为 `.env` 文件格式；
- 保留文件中其他未知行（如注释、未来新增字段），只覆盖目标四行；
- 如果某字段原本不存在，追加到文件末尾；
- 写入路径固定为项目根目录 `.env`。

新增 `electron/ipc/config.ts` 注册两个 handler：

```ts
ipcMain.handle('config:get', async () => loadEnv(process.env))  // 或从文件重新读取
ipcMain.handle('config:write', async (_, config: AppConfig) => saveEnv(config))
```

在 `electron/ipc/index.ts` 的 `registerAllIpc()` 中调用 `registerConfigIpc()`。

### 4.3 渲染进程实现

新增页面 `src/pages/Settings.tsx`：

- 进入时调用 `ipc.getConfig()` 获取当前配置作为表单初始值；
- 使用本地 state 管理表单值、显示/隐藏、验证状态；
- 点击"保存"时调用 `ipc.writeConfig(form)`，成功后 `showToast('配置已保存，重启后生效')`；
- 点击"作废"时重置表单到初始配置。

修改 `src/store/index.ts`：

- `Page` 类型加入 `'settings'`；
- 无需新增全局状态，配置不进入 store。

修改 `src/App.tsx`：

- 在路由切换中加入 `currentPage === 'settings' && <Settings />`。

修改 `src/pages/Home.tsx`：

- 在"卷宗"按钮左侧新增"设置"按钮：

```tsx
<Button variant="ghost" onClick={() => goto('settings')} className="absolute top-4 right-36 font-sans text-sm z-10">
  设置
</Button>
```

同时调整现有按钮的 `right-*` 定位，确保四按钮从左到右为：换画（最右）、设置、卷宗、扩展。

当前定位：
- 换画：`right-36`
- 卷宗：`right-20`
- 扩展：`right-4`

新增设置后建议定位：
- 换画：`right-52`
- 设置：`right-36`
- 卷宗：`right-20`
- 扩展：`right-4`

### 4.4 不在 store 中缓存配置的原因

渲染进程运行期间不需要频繁读取 `.env` 配置。把配置保存在设置页本地 state 中，进入页面时读取一次即可，避免向全局 store 引入与 UI 状态无关的数据。

## 5. 错误处理

### 5.1 表单级校验

- API Key 为空：禁用"验证连接"和"保存"，并在 API Key 字段下方显示提示。
- 学习库路径为空：禁用"保存"。
- Base URL / Model 为空：点击保存前，按 `loadEnv` 的逻辑将空值回退为默认值（Base URL 为 `https://api.kimi.com/coding/v1`，Model 为 `kimi-k2.6`），再写入 `.env`。

### 5.2 验证失败

- 显示 `setupProbeKey` 返回的具体原因或抛出的错误信息。
- 常见错误分类：401/UNAUTHORIZED → "API Key 无效"；TIMEOUT → "网络超时"；其他 → "验证失败，请检查配置"。

### 5.3 写入失败

- `writeConfig` 抛出时，在设置页顶部错误区显示错误信息。
- 不自动关闭设置页，允许用户继续修改。

### 5.4 路径变更的副作用

- 仅修改 `.env` 中的 `STUDY_LIBRARY_PATH`，不迁移文件。
- 如果新路径不存在，应用下次启动时的行为与当前逻辑保持一致（`loadEnv` 不检查目录存在性，启动后的扫描逻辑决定后续表现）。

## 6. 视觉与风格

- 整体沿用暗色纸张质感：深褐 `#2a1f1a` 背景、米色 `#e8d5b7` 文字、暖橙 `#d97757` 强调。
- 标题"设置 · 仪器调校"呼应 Disco Elysium 的"调校你的内在仪器"叙事，也暗合波兰尼的"默会知识"——配置不是被填满的表格，而是学习者与自己工具之间的默契调校。
- 卡片标题使用 `text-ember` 强调色，字段说明使用低对比度的 `text-parchment/60`。
- 按钮沿用现有 `Button` 组件和手写体/无衬线字体组合。

## 7. 测试

### 7.1 单元测试

- `tests/env.test.ts`：补充 `saveEnv` 的测试。
  - 覆盖四个字段的更新；
  - 保留文件中未知行和注释；
  - 字段不存在时追加；
  - 空值/缺失值处理。
- 新增 `tests/settings.test.tsx`：
  - 渲染 Settings 页面，确认四个字段回显正确；
  - API Key 显示/隐藏切换；
  - 验证按钮调用 `setupProbeKey` 并传入当前字段值；
  - 保存按钮调用 `writeConfig` 并传入当前字段值；
  - 空 API Key 时禁用保存和验证。

### 7.2 手动验证

- 进入设置页，确认当前 `.env` 值正确显示。
- 修改 API Key 后点击"验证连接"，确认状态变化。
- 修改学习库路径后保存，检查 `.env` 已更新。
- 重启应用，确认新配置生效。

## 8. 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 设置入口位置 | 卷宗左侧文字按钮 | 用户明确要求"卷宗左侧"；与"卷宗/扩展"文字按钮风格一致 |
| 换画按钮形式 | 保持图标 | 用户明确要求不换文字 |
| 设置页形式 | 独立页面 | 用户选择 C，与 Profile/Extension 一致 |
| 设置页布局 | 卡片式 | 用户选择方案 1；与现有 Extension 页风格一致，实现简单 |
| 默认显示 | AI 服务卡片 | 用户要求默认显示并可修改、验证 |
| 验证时机 | 独立按钮，不阻塞保存 | 给用户控制权；与 SetupWizard 的"验证并继续"解耦 |
| 配置生效方式 | 保存后提示手动重启 | 用户选择 A；避免自动重启带来的意外和数据丢失风险 |
| 配置存储位置 | 继续写回 `.env` | 与现有架构一致，不引入新的持久化层 |
| 是否进入全局 store | 否 | 配置不是渲染进程运行时频繁需要的状态 |

## 9. 相关文件

- `src/pages/Home.tsx` —— 新增"设置"按钮。
- `src/pages/Settings.tsx` —— 新增设置页。
- `src/App.tsx` —— 加入 `settings` 路由。
- `src/store/index.ts` —— `Page` 类型加入 `'settings'`。
- `src/types/index.ts` —— `IpcApi` 加入 `getConfig` / `writeConfig`。
- `src/lib/ipc.ts` —— 渲染端 IPC facade 加入 `getConfig` / `writeConfig`。
- `electron/env.ts` —— 新增 `saveEnv`。
- `electron/ipc/config.ts` —— 新增 IPC handler（新增文件）。
- `electron/ipc/index.ts` —— 注册新 handler。
- `tests/env.test.ts` —— 补充 `saveEnv` 测试。
- `tests/settings.test.tsx` —— 新增设置页测试（新增文件）。
