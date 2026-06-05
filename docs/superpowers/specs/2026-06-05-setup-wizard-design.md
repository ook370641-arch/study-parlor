# 首次使用配置向导设计文档

**日期**: 2026-06-05
**作者**: Study Parlor Team
**状态**: 待实现

## 1. 目标与背景

### 1.1 问题陈述

当前 Study Parlor 的首次使用体验存在以下痛点：

1. **node_modules 检查缺失**: 用户克隆仓库后直接 `npm run dev`，如果忘记 `npm install`，会得到晦涩的 Node 模块未找到错误，而非明确的提示
2. **.env 配置全靠手动**: 用户需要手动编辑 `.env` 文件，填入 API Key 和学习库路径。配置错误时看到的是一段文字错误墙（fatal error 页面），而非引导式配置
3. **用户名配置无入口**: profile 中的 `name` 字段需要用户进入 Profile 页面后才可设置，首次启动时 AI 无法使用用户昵称

### 1.2 设计目标

- 从 `npm install` 到正常使用的全链路首次体验友好
- 配置过程图形化、引导式，不需要手动编辑文件
- API Key 即时验证，问题在向导阶段即解决
- 配置完成后**无需重启应用**，平滑过渡到正常启动

---

## 2. 总体架构

```
[用户执行 npm run dev]
          ↓
┌─────────────────────────┐
│  scripts/pre-check.js   │
│  1. 检查 node_modules   │
│     - 不存在 → CLI 提示  │
│  2. 检查 .env           │
│     - 不存在 → 从       │
│       .env.example 复制  │
└─────────────────────────┘
          ↓ (pre-check 通过)
┌─────────────────────────┐
│  electron-vite dev      │
│  启动 Vite server +     │
│  Electron 主进程        │
└─────────────────────────┘
          ↓
┌─────────────────────────┐
│  main.ts bootstrap()    │
│  loadEnv() → 成功?      │
│     是 → runBootSequence│
│     否 → 标记 needSetup │
│     创建窗口(无论结果)  │
└─────────────────────────┘
          ↓
┌─────────────────────────┐
│  App.tsx                │
│  bootFatal?             │
│     是 → SetupWizard    │
│     否 → LoadingScreen  │
│          → boot:complete│
│          → 正常启动     │
└─────────────────────────┘
          ↓
┌─────────────────────────┐
│  SetupWizard (4步)      │
│  1. 欢迎                 │
│  2. API Key + 即时验证   │
│  3. 学习库目录           │
│  4. 用户名 → 完成        │
└─────────────────────────┘
          ↓
┌─────────────────────────┐
│  写入配置                │
│  - 写 .env              │
│  - 注入 process.env     │
│  - patchState profile   │
│  → 触发 boot:complete   │
│  → 页面切换到 Cover     │
└─────────────────────────┘
```

### 2.1 关键决策

- **node_modules 检查**在 pre-check.js（Node 脚本）中完成，因为主进程代码本身就依赖这些模块
- **.env 的缺失不 fatal**，只触发向导。真正的 fatal 错误保留给窗口创建失败等不可恢复场景
- **热启动而非重启**：配置写入后，`main.ts` 将配置注入 `process.env`，重新调用 `runBootSequence()`，前端监听 `boot:complete` 自动过渡

---

## 3. 启动前检查（scripts/pre-check.js）

### 3.1 职责

在 `electron-vite` 执行前运行，纯 Node.js，不依赖任何第三方模块。

### 3.2 检查逻辑

1. **node_modules 存在性**：检查 `node_modules/` 目录是否存在
   - 不存在 → 彩色 CLI 输出提示，exit 1
   - 存在 → 继续
2. **.env 存在性**：检查 `.env` 文件是否存在
   - 不存在且 `.env.example` 存在 → 复制 `.env.example` → `.env`，CLI 提示用户"请完成应用内配置"
   - 不存在且 `.env.example` 不存在 → CLI 警告但放行
   - 存在 → 继续

### 3.3 CLI 输出示例

```
错误：未找到 node_modules/
请先运行 npm install 安装依赖，然后再启动应用。

步骤：
  1. cd 到项目根目录
  2. npm install
  3. npm run dev
```

### 3.4 注入方式

修改 `package.json` 的 `dev` 脚本：

```json
"dev": "node scripts/pre-check.js && node scripts/dev.js dev"
```

或修改 `scripts/dev.js` 开头调用 `pre-check.js` 的同步逻辑。

---

## 4. 主进程改造（electron/main.ts）

### 4.1 bootstrap() 流程调整

```ts
let needsSetup = false
let fatalError: string | null = null

async function bootstrap() {
  let cfg: ReturnType<typeof loadEnv>

  try {
    cfg = loadEnv(process.env)
    // 原有目录可写检查...
  } catch (err: any) {
    // loadEnv 失败 → 标记需要配置向导
    needsSetup = true
  }

  // 无论配置结果如何，都创建窗口
  mainWindow = new BrowserWindow({...})

  // IPC handlers
  ipcMain.handle('boot:fatal', () => fatalError)
  ipcMain.handle('boot:needsSetup', () => needsSetup)

  if (fatalError) return

  if (!needsSetup) {
    // 正常 boot
    runBootSequence(cfg!, mainWindow)
  }
  // needsSetup 时，不调用 runBootSequence，等向导完成后由 IPC handler 触发
}
```

### 4.2 新增 IPC handler: setup:selectDirectory

```ts
ipcMain.handle('setup:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: '选择学习库目录'
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, path: null }
  }
  return { canceled: false, path: result.filePaths[0] }
})
```

### 4.3 新增 IPC handler: setup:probeKey

```ts
ipcMain.handle('setup:probeKey', async (_, args) => {
  const { apiKey, baseUrl, model } = args
  const result = await probeModelWithCredentials({ apiKey, baseUrl, model })
  return result  // { ok: boolean; reason?: string }
})
```

需要新增 `probeModelWithCredentials` 函数（见 5.2）。

### 4.4 新增 IPC handler: setup:writeConfig

```ts
ipcMain.handle('setup:writeConfig', async (_, args) => {
  const { apiKey, baseUrl, model, libraryPath, name, profile_text, preferred_topics } = args

  // 1. 写 .env
  writeEnvFile({ apiKey, baseUrl, model, libraryPath })

  // 2. 创建目录（如果不存在）
  fs.mkdirSync(libraryPath, { recursive: true })
  // 验证可写
  const testFile = path.join(libraryPath, '.write-test')
  fs.writeFileSync(testFile, '')
  fs.unlinkSync(testFile)

  // 3. 注入 process.env
  process.env.KIMI_API_KEY = apiKey
  process.env.KIMI_BASE_URL = baseUrl
  process.env.KIMI_MODEL = model
  process.env.STUDY_LIBRARY_PATH = libraryPath

  // 4. 重新加载配置
  const newCfg = loadEnv(process.env)

  // 5. 注册 IPC（如果之前没注册）
  registerAllIpc(newCfg, () => mainWindow)

  // 6. 更新 profile
  // 复用 state.ts 中已有的 patchState 函数
  patchState({
    profile: {
      name,
      profile_text: profile_text || '',
      preferred_topics: preferred_topics || []
    }
  })

  // 7. 发送完成事件
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setup:done')
  }

  // 8. 启动 boot sequence
  runBootSequence(newCfg, mainWindow!)
})
```

### 4.4 writeEnvFile 函数

```ts
function writeEnvFile(config: { apiKey: string; baseUrl: string; model: string; libraryPath: string }) {
  const lines = [
    `KIMI_API_KEY=${config.apiKey}`,
    `KIMI_BASE_URL=${config.baseUrl}`,
    `KIMI_MODEL=${config.model}`,
    `STUDY_LIBRARY_PATH=${config.libraryPath}`,
  ]
  const envPath = path.join(process.cwd(), '.env')
  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8')
}
```

---

## 5. LLM 层改造（electron/lib/kimi.ts）

### 5.1 新增 probeModelWithCredentials

提取 `probeModel` 的核心逻辑为一个独立函数，接受配置对象而非从全局 cfg 读取：

```ts
export async function probeModelWithCredentials(
  creds: { apiKey: string; baseUrl: string; model: string }
): Promise<{ ok: boolean; reason?: string }> {
  // 与现有 probeModel 相同的实现，只是从参数读取而非 cfg
}
```

### 5.2 重构 probeModel

```ts
export async function probeModel(cfg: AppConfig): Promise<{ ok: boolean; reason?: string }> {
  return probeModelWithCredentials(cfg)
}
```

---

## 6. Preload 改造（electron/preload.ts）

### 6.1 新增 IPC 暴露

```ts
bootNeedsSetup: () =>
  ipcRenderer.invoke('boot:needsSetup') as Promise<boolean>,
setupSelectDirectory: () =>
  ipcRenderer.invoke('setup:selectDirectory') as Promise<{ canceled: boolean; path: string | null }>,
setupProbeKey: (args: { apiKey: string; baseUrl?: string; model?: string }) =>
  ipcRenderer.invoke('setup:probeKey', args),
setupWriteConfig: (args: SetupConfigArgs) =>
  ipcRenderer.invoke('setup:writeConfig', args),
onSetupDone: (cb: () => void) => {
  const handler = () => cb()
  ipcRenderer.on('setup:done', handler)
  return () => ipcRenderer.off('setup:done', handler)
},
```

### 6.2 类型更新

在 `src/types/index.ts` 的 `IpcApi` 中新增：

```ts
bootNeedsSetup: () => Promise<boolean>
setupSelectDirectory: () => Promise<{ canceled: boolean; path: string | null }>
setupProbeKey: (args: { apiKey: string; baseUrl?: string; model?: string }) => Promise<{ ok: boolean; reason?: string }>
setupWriteConfig: (args: {
  apiKey: string
  baseUrl: string
  model: string
  libraryPath: string
  name: string
  profile_text?: string
  preferred_topics?: string[]
}) => Promise<void>
onSetupDone: (cb: () => void) => () => void
```

---

## 7. 前端组件：SetupWizard

### 7.1 组件位置

`src/components/SetupWizard.tsx`

### 7.2 状态管理

使用 React `useState` 管理本地状态，不放入 Zustand store（向导状态是启动时短暂的，不需要持久化）。

```ts
type WizardStep = 1 | 2 | 3 | 4

interface WizardState {
  step: WizardStep
  apiKey: string
  baseUrl: string
  model: string
  apiKeyVerified: boolean
  libraryPath: string
  libraryVerified: boolean
  name: string
  profileText: string
  preferredTopics: string
  loading: boolean
  error: string | null
}
```

### 7.3 四步详细设计

#### Step 1: 欢迎

- **视觉**: 居中大标题 + 副标题 + 装饰性图标
- **文案**: "欢迎来到学者夜话 —— 你的个人 AI 学习助手。接下来需要完成三个配置，大约需要 2 分钟。"
- **按钮**: "开始配置"（暖橙色主按钮）
- **无验证**

#### Step 2: API Key 配置

- **标题**: "配置 AI 服务"
- **输入项**:
  - API Key: `<input type="password" />`，右侧有眼睛图标切换显示/隐藏
  - Base URL: `<input type="text" />`，默认 `https://api.kimi.com/coding/v1`
  - Model: `<input type="text" />`，默认 `kimi-k2.6`
- **按钮**:
  - "验证并继续"（主按钮）
  - "返回"（次级按钮，回到 Step 1）
- **验证流程**:
  1. 点击"验证并继续" → `setLoading(true)`
  2. 调用 `ipc.setupProbeKey({ apiKey, baseUrl, model })`
  3. 等待响应
  4. `ok === true` → `setStep(3)`，`setApiKeyVerified(true)`
  5. `ok === false` → `setError(reason)`，停留当前页面
- **错误展示**: 输入框下方红色文字，如 "401 Unauthorized — API Key 无效，请检查拼写"
- **Step 2 完成后的视觉**: Step 2 区域折叠为只读摘要，顶部进度条 Step 2 打勾

#### Step 3: 学习库目录

- **标题**: "选择学习库位置"
- **说明**: "这是存放你学习笔记的目录，应用会在这里自动创建子目录来组织不同话题的学习记录。"
- **输入方式**:
  - 文本输入框（可手动输入绝对路径）
  - "选择目录"按钮 → 调用 `ipc.setupSelectDirectory()` 打开系统目录选择对话框
- **默认建议**: 根据平台自动建议：
  - macOS: `~/Documents/studyparlor-library`
  - Windows: `~/Documents/studyparlor-library`
  - Linux: `~/Documents/studyparlor-library`
- **按钮**:
  - "确认并继续"（主按钮）
  - "返回"（次级按钮）
- **验证流程**:
  1. 点击"确认并继续"
  2. 检查目录是否存在 → 不存在则通过 IPC 询问是否创建
  3. 检查目录可写 → 不可写则显示错误
  4. 通过 → `setStep(4)`
- **错误展示**: "目录不可写入，请检查权限或选择其他目录"

#### Step 4: 个人信息

- **标题**: "你的学习名片"
- **输入项**:
  - **昵称**（必填）: 文本输入框，placeholder "如：小明"
  - **个人简介**（可选）: textarea，placeholder "如：编程初学者，喜欢通过类比理解概念"
  - **感兴趣的话题**（可选）: 文本输入框，placeholder "用逗号分隔，如：机器学习、哲学、历史"
- **按钮**:
  - "开始使用"（主按钮，暖橙色）
  - "返回"（次级按钮）
- **完成逻辑**:
  1. 验证昵称非空
  2. `setLoading(true)`
  3. 调用 `ipc.setupWriteConfig({ apiKey, baseUrl, model, libraryPath, name, profile_text, preferred_topics })`
  4. 等待 `setup:done` 事件
  5. 事件到达后，组件 unmount，App.tsx 进入正常 boot 流程

### 7.4 进度指示器

顶部一条水平进度条，4等分：
- 已完成 step：暖橙色 + 勾图标
- 当前 step：暖橙色高亮 + 数字
- 未到来 step：灰色 + 数字

### 7.5 样式

- 使用现有 Tailwind 自定义颜色：`parchment`（文字）、`ember`（按钮/高亮）、`ink`（背景）
- 全屏覆盖，背景色 `#2a1f1a`
- 卡片式布局，最大宽度 480px，居中
- 与现有 `fatal` 错误页面保持一致的暗色主题

---

## 8. App.tsx 改造

### 8.1 状态机

```
[isBooting] ──(boot:complete)──→ [正常页面]
   │
   │ needsSetup === true
   ↓
[SetupWizard]
   │
   │ setup:done 事件
   ↓
[LoadingScreen] ──(boot:complete)──→ [正常页面]
```

### 8.2 具体逻辑

```tsx
export function App() {
  const page = useStore(s => s.currentPage)
  const init = useStore(s => s.init)
  const [fatal, setFatal] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [isBooting, setIsBooting] = useState(true)

  useEffect(() => {
    Promise.all([ipc.bootFatal(), ipc.bootNeedsSetup()]).then(([f, ns]) => {
      if (f) {
        setFatal(f)
        setIsBooting(false)
        return
      }
      if (ns) {
        setNeedsSetup(true)
        setIsBooting(false)
        return
      }
      // 正常 boot，LoadingScreen 接管
    })
  }, [])

  const handleSetupDone = async () => {
    setNeedsSetup(false)
    setIsBooting(true)
    // 等待 boot:complete，然后走 handleBootComplete
  }

  const handleBootComplete = async () => {
    await init()
    // 现有的 llmProbe 逻辑...
    setIsBooting(false)
  }

  if (fatal) return <FatalErrorScreen fatal={fatal} />
  if (needsSetup) return <SetupWizard onDone={handleSetupDone} />

  return (
    <div className="h-full">
      {isBooting && <LoadingScreen onComplete={handleBootComplete} />}
      {!isBooting && <CurrentPage />}
    </div>
  )
}
```

---

## 9. 错误处理矩阵

| 场景 | 层级 | 处理方式 |
|---|---|---|
| `node_modules` 缺失 | pre-check.js | 彩色 CLI 输出，exit 1 |
| `.env.example` 缺失 | pre-check.js | 黄色警告 CLI 输出，继续执行 |
| `loadEnv` 失败（key 占位符） | main.ts | 标记 `needsSetup = true`，正常创建窗口 |
| `loadEnv` 失败（libraryPath 缺失） | main.ts | 标记 `needsSetup = true`，正常创建窗口 |
| API Key 验证 401 | SetupWizard Step 2 | 输入框下方红色错误文字："API Key 无效" |
| API Key 验证 403 | SetupWizard Step 2 | "User-Agent 被拦截，请联系开发者" |
| API Key 验证超时 | SetupWizard Step 2 | "连接超时，请检查网络或 Base URL" |
| 学习库目录不存在 | SetupWizard Step 3 | "目录不存在，是否创建？" + 确认对话框 |
| 学习库目录不可写 | SetupWizard Step 3 | "目录不可写入，请选择其他位置" |
| 写 `.env` 失败 | SetupWizard Step 4 | "保存配置失败：[errno]，请检查文件权限" |
| 昵称为空 | SetupWizard Step 4 | 输入框边框变红，提示"请输入昵称" |

---

## 10. 测试策略

### 10.1 单元测试

- `tests/env.test.ts`: 验证 `writeEnvFile` 的格式正确性
- `tests/kimi.test.ts`: 验证 `probeModelWithCredentials` 的行为与 `probeModel` 一致

### 10.2 集成测试（手动）

1. 删除 `node_modules` → `npm run dev` → 确认 CLI 提示正确
2. 删除 `.env` → `npm run dev` → 确认自动创建 `.env`，进入向导
3. 向导中输入无效 API Key → 确认验证失败并显示原因
4. 向导中输入有效 API Key → 确认进入 Step 3
5. 选择不可写目录 → 确认错误提示
6. 完成全部配置 → 确认 `.env` 内容正确，state.json 包含 profile，应用进入 Cover 页面
7. 再次 `npm run dev` → 确认跳过向导，直接进入 LoadingScreen

---

## 11. 变更文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `scripts/pre-check.js` | 新增 | 启动前检查脚本 |
| `package.json` | 修改 | `dev` 脚本添加 pre-check |
| `electron/main.ts` | 修改 | bootstrap 流程 + 新增 IPC handlers |
| `electron/env.ts` | 修改 | 新增 `writeEnvFile` 导出（或保留在 main.ts） |
| `electron/lib/kimi.ts` | 修改 | 新增 `probeModelWithCredentials` |
| `electron/preload.ts` | 修改 | 暴露 setup IPC 方法 |
| `src/types/index.ts` | 修改 | IpcApi 新增类型 |
| `src/App.tsx` | 修改 | 状态机改造 |
| `src/components/SetupWizard.tsx` | 新增 | 配置向导组件 |
| `src/lib/ipc.ts` | 修改 | 新增 IPC 调用封装（如果需要） |

---

## 12. 安全注意事项

1. **API Key 在前端输入时**：使用 `<input type="password" />`，防止屏幕录制/肩窥
2. **API Key 传输**：通过 IPC 传输，Electron 的 IPC 在同进程内，不经过网络
3. **API Key 存储**：写入 `.env` 纯文本文件，与当前方案一致。未来如需加密可考虑 keytar，但本次设计保持最小改动
4. **目录选择**：使用 Electron 原生的 `dialog.showOpenDialog`，避免用户手动输入路径时的路径注入风险

---

## 13. 未来扩展

- **多 provider 支持**：Step 2 可增加 provider 下拉选择（Kimi / OpenAI / DeepSeek 等），自动填充对应的 baseUrl 和 model
- **配置导入导出**：在 Profile 页面增加"导出配置"按钮，生成 `.env` + `state.json` 的备份
- **配置修改入口**：在 Profile 页面增加"重新配置"按钮，允许用户在不重启应用的情况下修改 API Key
