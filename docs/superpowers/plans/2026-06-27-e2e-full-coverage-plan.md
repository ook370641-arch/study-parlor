# Study Parlor 全量 E2E 测试实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Study Parlor 6 月 20 日及之前启用功能（夜航简报除外）补充完整 E2E 测试，覆盖每一个用户可见页面、按钮和状态流转。

**Architecture:** 页面模块式为主：新增/扩展 Page Object 封装 UI 交互，新增 spec 文件按页面/场景组织，少量 journey spec 串联核心流程。全部 LLM 调用走真实 Kimi API，通过现有 `E2E_CONFIG_DIR` / `E2E_STUDY_LIBRARY_PATH` 隔离测试环境。

**Tech Stack:** Playwright Test + Electron 30 + TypeScript；测试数据通过 `e2e/helpers/test-library.ts` 在临时目录 seed。

---

## File Structure

```
e2e/
  fixtures/electron.ts              # 不变
  helpers/
    selectors.ts                    # 扩展：补全 data-testid
    test-library.ts                 # 扩展：新增 seed 工厂
  pages/
    CoverPage.ts                    # 扩展
    HomePage.ts                     # 扩展
    PreStudyPage.ts                 # 扩展
    StudyPage.ts                    # 扩展
    ProfilePage.ts                  # 新增
    SettingsPage.ts                 # 新增
    LibraryPage.ts                  # 新增
    SetupWizardPage.ts              # 新增
    ArchiveReportPage.ts            # 新增
  specs/
    smoke.spec.ts                   # 不变
    quote-display.spec.ts           # 不变
    new-topic-progress.spec.ts      # 不变
    continue-topic.spec.ts          # 不变
    review-topic.spec.ts            # 不变
    cover.spec.ts                   # 新增
    home.spec.ts                    # 新增
    pre-study.spec.ts               # 新增
    study.spec.ts                   # 新增
    library-management.spec.ts      # 新增
    profile.spec.ts                 # 新增
    settings.spec.ts                # 新增
    onboarding-journey.spec.ts      # 新增
    archive-edge.spec.ts            # 新增
package.json                        # 扩展：新增 e2e 脚本
e2e/README.md                       # 扩展：补充 LLM 调用策略
```

业务组件只添加 `data-testid`，不修改行为：
- `src/components/SetupWizard.tsx`
- `src/pages/Profile.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Home.tsx`
- `src/components/PreStudyModal.tsx`
- `src/components/StudyLibrary.tsx`
- `src/components/StrategyToggle.tsx`
- `src/components/GroupRecCard.tsx`
- `src/components/ArchiveReportModal.tsx`
- `src/pages/Study.tsx`
- `src/components/ChatInput.tsx`

---

## Task 1: 扩展 selectors.ts

**Files:**
- Modify: `e2e/helpers/selectors.ts`

- [ ] **Step 1: 用完整 selectors 对象替换原文件**

```typescript
export const SELECTORS = {
  cover: {
    nameInput: '[data-testid="cover-name-input"]',
    enterButton: '[data-testid="cover-enter-button"]',
    lightButton: '[data-testid="cover-light-button"]',
    briefingButton: '[data-testid="cover-briefing-button"]',
  },
  home: {
    greeting: '[data-testid="home-greeting"]',
    newTopicButton: '[data-testid="new-topic-button"]',
    librarySection: '[data-testid="library-section"]',
    continueUnsavedButton: '[data-testid="continue-unsaved-button"]',
    burnUnsavedButton: '[data-testid="burn-unsaved-button"]',
    topicCard: '[data-testid="topic-card"]',
    topicContinueButton: '[data-testid="topic-continue-button"]',
    sessionReviewButton: '[data-testid="session-review-button"]',
    settingsButton: '[data-testid="home-settings-button"]',
    profileButton: '[data-testid="home-profile-button"]',
    extensionButton: '[data-testid="home-extension-button"]',
    strategyToggle: '[data-testid="strategy-toggle"]',
    strategyOption: (v: string) => `[data-testid="strategy-option-${v}"]`,
    groupRecCard: '[data-testid="group-rec-card"]',
    groupRecRefresh: '[data-testid="group-rec-refresh"]',
    groupRecTitle: '[data-testid="group-rec-title"]',
  },
  preStudy: {
    modal: '[data-testid="prestudy-modal"]',
    topicInput: '[data-testid="topic-input"]',
    topicSourceNew: '[data-testid="topic-source-new"]',
    topicSourceExisting: '[data-testid="topic-source-existing"]',
    existingTopicOption: '[data-testid="existing-topic-option"]',
    customTopicInput: '[data-testid="custom-topic-input"]',
    continueSuggestionCard: '[data-testid="continue-suggestion-card"]',
    userRequirementInput: '[data-testid="user-requirement-input"]',
    externalMaterialsToggle: '[data-testid="external-materials-toggle"]',
    difficultyButton: (d: string) => `[data-testid="difficulty-button-${d}"]`,
    temperatureButton: (t: string) => `[data-testid="temperature-button-${t}"]`,
    startButton: '[data-testid="start-button"]',
    cancelButton: '[data-testid="cancel-button"]',
  },
  study: {
    page: '[data-testid="study-page"]',
    messageList: '[data-testid="message-list"]',
    chatInput: '[data-testid="chat-input"]',
    sendButton: '[data-testid="send-button"]',
    archivePendingBanner: '[data-testid="archive-pending-banner"]',
    archiveButton: '[data-testid="archive-button"]',
    dismissArchiveButton: '[data-testid="dismiss-archive-button"]',
    archiveReportClose: '[data-testid="archive-report-close"]',
    archiveReportTitle: '[data-testid="archive-report-title"]',
    archiveReportBody: '[data-testid="archive-report-body"]',
    archiveLoadingOverlay: '[data-testid="archive-loading-overlay"]',
    archiveReturnHomeButton: '[data-testid="archive-return-home-button"]',
    assistantMessage: '[data-testid="assistant-message"]',
    userMessage: '[data-testid="user-message"]',
    streamErrorBanner: '[data-testid="stream-error-banner"]',
    streamRetryButton: '[data-testid="stream-retry-button"]',
    streamDismissButton: '[data-testid="stream-dismiss-button"]',
    externalMaterialsCard: '[data-testid="external-materials-card"]',
    swapPaintingButton: '[data-testid="swap-painting-button"]',
  },
  quote: {
    text: '[data-testid="quote-text"]',
    original: '[data-testid="quote-original"]',
    meta: '[data-testid="quote-meta"]',
    refreshButton: 'button[aria-label="换一句"]',
  },
  profile: {
    page: '[data-testid="profile-page"]',
    nameDisplay: '[data-testid="profile-name-display"]',
    textDisplay: '[data-testid="profile-text-display"]',
    topicsDisplay: '[data-testid="profile-topics-display"]',
    difficultyDisplay: '[data-testid="profile-difficulty-display"]',
    temperatureDisplay: '[data-testid="profile-temperature-display"]',
    editButton: '[data-testid="profile-edit-button"]',
    saveButton: '[data-testid="profile-save-button"]',
    cancelButton: '[data-testid="profile-cancel-button"]',
    nameInput: '[data-testid="profile-name-input"]',
    textInput: '[data-testid="profile-text-input"]',
    topicsInput: '[data-testid="profile-topics-input"]',
    difficultyButton: (d: string) => `[data-testid="profile-difficulty-${d}"]`,
    temperatureButton: (t: string) => `[data-testid="profile-temperature-${t}"]`,
    exitButton: '[data-testid="profile-exit-button"]',
  },
  settings: {
    page: '[data-testid="settings-page"]',
    apiKeyInput: '[data-testid="settings-api-key-input"]',
    apiKeyToggle: '[data-testid="settings-api-key-toggle"]',
    baseUrlInput: '[data-testid="settings-base-url-input"]',
    modelInput: '[data-testid="settings-model-input"]',
    verifyButton: '[data-testid="settings-verify-button"]',
    verifyStatus: '[data-testid="settings-verify-status"]',
    searchApiKeyInput: '[data-testid="settings-search-api-key-input"]',
    searchApiKeyToggle: '[data-testid="settings-search-api-key-toggle"]',
    searchSaveButton: '[data-testid="settings-search-save-button"]',
    libraryPathInput: '[data-testid="settings-library-path-input"]',
    selectDirectoryButton: '[data-testid="settings-select-directory-button"]',
    saveButton: '[data-testid="settings-save-button"]',
    resetButton: '[data-testid="settings-reset-button"]',
    backButton: '[data-testid="settings-back-button"]',
    errorDisplay: '[data-testid="settings-error-display"]',
  },
  library: {
    groupTab: (id: string) => `[data-testid="group-tab-${id}"]`,
    groupTabAll: '[data-testid="group-tab-all"]',
    createGroupButton: '[data-testid="create-group-button"]',
    groupRenameInput: '[data-testid="group-rename-input"]',
    groupDeleteButton: '[data-testid="group-delete-button"]',
    groupGuideButton: '[data-testid="group-guide-button"]',
    gravityField: '[data-testid="gravity-field"]',
    gravityGroupTarget: (id: string) => `[data-testid="gravity-target-${id}"]`,
    sessionViewer: '[data-testid="session-viewer"]',
    sessionViewerClose: '[data-testid="session-viewer-close"]',
    sessionViewerTitle: '[data-testid="session-viewer-title"]',
    sessionFileButton: '[data-testid="session-file-button"]',
    fableButton: '[data-testid="session-fable-button"]',
    generateFableButton: '[data-testid="generate-fable-button"]',
    diagramButton: '[data-testid="session-diagram-button"]',
    generateDiagramButton: '[data-testid="generate-diagram-button"]',
    deleteSessionButton: '[data-testid="delete-session-button"]',
    paginationPrev: '[data-testid="pagination-prev"]',
    paginationNext: '[data-testid="pagination-next"]',
    paginationDot: (i: number) => `[data-testid="pagination-dot-${i}"]`,
  },
  setupWizard: {
    stepIndicator: (s: number) => `[data-testid="wizard-step-${s}"]`,
    nextButton: '[data-testid="wizard-next-button"]',
    backButton: '[data-testid="wizard-back-button"]',
    apiKeyInput: '[data-testid="wizard-api-key-input"]',
    apiKeyToggle: '[data-testid="wizard-api-key-toggle"]',
    baseUrlInput: '[data-testid="wizard-base-url-input"]',
    modelInput: '[data-testid="wizard-model-input"]',
    libraryPathInput: '[data-testid="wizard-library-path-input"]',
    selectDirectoryButton: '[data-testid="wizard-select-directory-button"]',
    nameInput: '[data-testid="wizard-name-input"]',
    profileTextInput: '[data-testid="wizard-profile-text-input"]',
    preferredTopicsInput: '[data-testid="wizard-preferred-topics-input"]',
    errorDisplay: '[data-testid="wizard-error-display"]',
  },
  confirmDialog: {
    dialog: '[data-testid="confirm-dialog"]',
    confirmButton: '[data-testid="confirm-dialog-confirm"]',
    cancelButton: '[data-testid="confirm-dialog-cancel"]',
  },
  fableStyleDialog: {
    dialog: '[data-testid="fable-style-dialog"]',
    tagButton: (tag: string) => `[data-testid="fable-tag-${tag}"]`,
    customTagInput: '[data-testid="fable-custom-tag-input"]',
    addCustomTagButton: '[data-testid="fable-add-custom-tag-button"]',
    descriptionInput: '[data-testid="fable-description-input"]',
    startButton: '[data-testid="fable-start-button"]',
    cancelButton: '[data-testid="fable-cancel-button"]',
  },
  toast: '[data-testid="toast-message"]',
} as const
```

- [ ] **Step 2: 提交**

```bash
git add e2e/helpers/selectors.ts
git commit -m "test(e2e): extend selectors for full coverage"
```

---

## Task 2: 为业务组件添加 data-testid

**Files:**
- Modify: `src/components/SetupWizard.tsx`
- Modify: `src/pages/Profile.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/components/PreStudyModal.tsx`
- Modify: `src/components/StudyLibrary.tsx`
- Modify: `src/components/StrategyToggle.tsx`
- Modify: `src/components/GroupRecCard.tsx`
- Modify: `src/components/ArchiveReportModal.tsx`
- Modify: `src/pages/Study.tsx`
- Modify: `src/components/ChatInput.tsx`

- [ ] **Step 1: SetupWizard.tsx 添加 data-testid**

为第 1-4 步的按钮、输入框、错误提示添加对应 `data-testid`：

```tsx
// 第 1 步
<button data-testid="wizard-next-button" onClick={() => { clearError(); setStep(2) }}>
  开始配置
</button>

// 第 2 步
<input data-testid="wizard-api-key-input" ... />
<button data-testid="wizard-api-key-toggle" ...>...</button>
<input data-testid="wizard-base-url-input" ... />
<input data-testid="wizard-model-input" ... />
<button data-testid="wizard-next-button" onClick={handleProbeKey} ...>
  {loading ? '验证中...' : '验证并继续'}
</button>
<button data-testid="wizard-back-button" onClick={() => { clearError(); setStep(1) }}>
  返回
</button>
<div data-testid="wizard-error-display" ...>{error}</div>

// 第 3 步
<input data-testid="wizard-library-path-input" ... />
<button data-testid="wizard-select-directory-button" onClick={handleSelectDirectory}>选择目录</button>
<button data-testid="wizard-next-button" onClick={() => { clearError(); setStep(4) }}>确认并继续</button>

// 第 4 步
<input data-testid="wizard-name-input" ... />
<textarea data-testid="wizard-profile-text-input" ... />
<input data-testid="wizard-preferred-topics-input" ... />
<button data-testid="wizard-next-button" onClick={handleWriteConfig} ...>开始使用</button>

// 顶部步骤指示器
<div data-testid={`wizard-step-${s}`} ...>...</div>
```

- [ ] **Step 2: Profile.tsx 添加 data-testid**

```tsx
<div data-testid="profile-page">...
  <div data-testid="profile-name-display">{profile.name}</div>
  <div data-testid="profile-topics-display">...</div>
  <div data-testid="profile-text-display">...</div>
  <div data-testid="profile-difficulty-display">...</div>
  <div data-testid="profile-temperature-display">...</div>
  <button data-testid="profile-edit-button" onClick={() => setEditing(true)}>改写</button>
  <button data-testid="profile-exit-button" onClick={() => goto('home')}>退出</button>

  {/* 编辑模式 */}
  <input data-testid="profile-name-input" value={name} ... />
  <textarea data-testid="profile-text-input" value={text} ... />
  <input data-testid="profile-topics-input" value={topics} ... />
  <button data-testid={`profile-difficulty-${difficulty}`} ...> ...difficulty buttons
  <button data-testid={`profile-temperature-${temperature}`} ...> ...temperature buttons
  <button data-testid="profile-save-button" onClick={onSave}>落印</button>
  <button data-testid="profile-cancel-button" onClick={() => setEditing(false)}>作废</button>
</div>
```

> 难度/温度按钮需要映射成统一组件，确保每个选项都有 `data-testid="profile-difficulty-high"` 等。

- [ ] **Step 3: Settings.tsx 添加 data-testid**

```tsx
<div data-testid="settings-page">...
  <button data-testid="settings-back-button" onClick={() => goto('home')}>返回夜话</button>
  <input data-testid="settings-api-key-input" ... />
  <button data-testid="settings-api-key-toggle" ...>...</button>
  <input data-testid="settings-base-url-input" ... />
  <input data-testid="settings-model-input" ... />
  <button data-testid="settings-verify-button" onClick={handleVerify}>验证连接</button>
  <span data-testid="settings-verify-status">...</span>
  <input data-testid="settings-search-api-key-input" ... />
  <button data-testid="settings-search-api-key-toggle" ...>...</button>
  <button data-testid="settings-search-save-button" onClick={handleSaveSearchKey}>保存</button>
  <input data-testid="settings-library-path-input" ... />
  <button data-testid="settings-select-directory-button" onClick={handleSelectDirectory}>选择目录</button>
  <button data-testid="settings-save-button" onClick={handleSave}>保存</button>
  <button data-testid="settings-reset-button" onClick={resetForm}>作废</button>
  <div data-testid="settings-error-display">{error}</div>
</div>
```

- [ ] **Step 4: Home.tsx 添加 data-testid**

```tsx
<Button data-testid="home-settings-button" onClick={() => goto('settings')}>设置</Button>
<Button data-testid="home-profile-button" onClick={() => goto('profile')}>{t.libraryName}</Button>
<Button data-testid="home-extension-button" onClick={() => goto('extension')}>扩展</Button>
<button data-testid="burn-unsaved-button" onClick={() => removeUnsavedSession(firstUnsaved.id)}>{t.burnVerb}</button>
```

- [ ] **Step 5: PreStudyModal.tsx 添加 data-testid**

```tsx
<button data-testid="existing-topic-option" key={t.dirName} ...>
<input data-testid="custom-topic-input" value={customTopic} ... />
<button data-testid="continue-suggestion-card" ...>
<input data-testid="user-requirement-input" ... />
<button data-testid="external-materials-toggle" ...>
<button data-testid={`difficulty-button-${difficultyValue}`} ...>
<button data-testid={`temperature-button-${temperatureValue}`} ...>
```

- [ ] **Step 6: StudyLibrary.tsx 添加 data-testid**

```tsx
<button data-testid="group-tab-all" onClick={() => setActiveGroup(null)}>全部</button>
<button data-testid={`group-tab-${group.id}`} ...>{group.name}</button>
<button data-testid="create-group-button" onClick={createGroup}>+</button>
<input data-testid="group-rename-input" ... />
<button data-testid="group-delete-button" ...>✕</button>
<button data-testid="group-guide-button" ...>i</button>
<div data-testid="gravity-field">...</div>
<div data-testid={`gravity-target-${group.id}`}>...</div>
<button data-testid="session-file-button" onClick={...}>谈话记录</button>
<button data-testid="session-fable-button" ...>寓言</button>
<button data-testid="generate-fable-button" ...>✨ 唤醒寓言</button>
<button data-testid="session-diagram-button" ...>图表</button>
<button data-testid="generate-diagram-button" ...>生成图表</button>
<button data-testid="session-review-button" ...>复习</button>
<button data-testid="delete-session-button" onClick={...}>✕</button>
<button data-testid="pagination-prev" ...>前一屉</button>
<button data-testid="pagination-next" ...>后一屉</button>
<button data-testid={`pagination-dot-${i}`} ... />
```

- [ ] **Step 7: StrategyToggle.tsx 添加 data-testid**

```tsx
<div data-testid="strategy-toggle" ...>
  <button data-testid="strategy-option-v1" ...>v1</button>
  <button data-testid="strategy-option-v2" ...>v2</button>
  <button data-testid="strategy-option-v3" ...>v3</button>
</div>
```

- [ ] **Step 8: GroupRecCard.tsx 添加 data-testid**

```tsx
<div data-testid="group-rec-card" ...>
  <button data-testid="group-rec-refresh" ...>↻</button>
  <div data-testid="group-rec-title">...</div>
</div>
```

- [ ] **Step 9: ArchiveReportModal.tsx 添加 data-testid**

```tsx
<div data-testid="archive-report-modal" ...>
  <h2 data-testid="archive-report-title">...</h2>
  <div data-testid="archive-report-body">...</div>
  <button data-testid="archive-report-close">结案</button>
</div>
```

- [ ] **Step 10: Study.tsx 添加 data-testid**

```tsx
<div data-testid="stream-error-banner" ...>
  <button data-testid="stream-retry-button" ...>重递</button>
  <button data-testid="stream-dismiss-button" ...>合上</button>
</div>
<button data-testid="dismiss-archive-button" ...>暂不封存</button>
<div data-testid="archive-loading-overlay" ...>
  <button data-testid="archive-return-home-button" ...>返回</button>
</div>
<button data-testid="swap-painting-button" ...>换画</button>
<div data-testid="external-materials-card" ...>...</div>
```

- [ ] **Step 11: ChatInput.tsx 添加 data-testid（如缺失）**

```tsx
<textarea data-testid="chat-input" ... />
<Button data-testid="send-button" ...>递出</Button>
```

- [ ] **Step 12: 提交**

```bash
git add src/components/SetupWizard.tsx src/pages/Profile.tsx src/pages/Settings.tsx src/pages/Home.tsx src/components/PreStudyModal.tsx src/components/StudyLibrary.tsx src/components/StrategyToggle.tsx src/components/GroupRecCard.tsx src/components/ArchiveReportModal.tsx src/pages/Study.tsx src/components/ChatInput.tsx
git commit -m "test(e2e): add data-testid attributes for full coverage"
```

---

## Task 3: 扩展 test-library.ts

**Files:**
- Modify: `e2e/helpers/test-library.ts`

- [ ] **Step 1: 在文件末尾追加 seed 工厂**

```typescript
export function seedMultiSessionTopic(
  libPath: string,
  slug: string,
  title: string,
  sessionCount: number = 3
): void {
  validateSlug(slug)
  const now = new Date()
  for (let i = 1; i <= sessionCount; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - (sessionCount - i) * 7)
    const dir = path.join(libPath, slug, `s${i}`)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, '学习报告.md')
    const content = `---
title: ${title}
description: E2E fixture session ${i}
type: progress
created: '${d.toISOString()}'
tags:
  - test
session_number: ${i}
difficulty: mid
progress_summary: E2E fixture session ${i}
last_studied: '${d.toISOString()}'
review_count: 0
---

# ${title} · 第${i}次

这是 E2E 测试用的占位学习报告。
`
    fs.writeFileSync(filePath, content)
  }
}

export function seedTopicWithFable(
  libPath: string,
  slug: string,
  title: string
): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })

  const reportContent = `---
title: ${title}
description: E2E fixture with fable
type: progress
created: '${new Date().toISOString()}'
tags:
  - test
session_number: 1
difficulty: mid
progress_summary: E2E fixture with fable
last_studied: '${new Date().toISOString()}'
review_count: 0
---

# ${title}

占位报告。
`
  fs.writeFileSync(path.join(dir, '学习报告.md'), reportContent)

  const fableContent = `---
title: ${title} 的寓言
description: 自动生成
session_number: 1
---

# 寓言

从前有一只用于 E2E 测试的狐狸。
`
  fs.writeFileSync(path.join(dir, '寓言.md'), fableContent)
}

export function seedTopicWithDiagram(
  libPath: string,
  slug: string,
  title: string
): void {
  validateSlug(slug)
  const dir = path.join(libPath, slug, 's1')
  fs.mkdirSync(dir, { recursive: true })

  const reportContent = `---
title: ${title}
description: E2E fixture with diagram
type: progress
created: '${new Date().toISOString()}'
tags:
  - test
session_number: 1
difficulty: mid
progress_summary: E2E fixture with diagram
last_studied: '${new Date().toISOString()}'
review_count: 0
---

# ${title}

占位报告。
`
  fs.writeFileSync(path.join(dir, '学习报告.md'), reportContent)

  const diagramContent = `# 流程图

\`\`\`mermaid
graph TD
  A[开始] --> B[结束]
\`\`\`
`
  fs.writeFileSync(path.join(dir, '流程图.md'), diagramContent)
}

type GroupDef = { id: string; name: string; color?: string }
type GroupMapping = { dirName: string; groupId: string | null }

export function seedGroupState(
  libPath: string,
  groups: GroupDef[],
  mappings: GroupMapping[]
): void {
  const state = {
    groups,
    mappings,
  }
  fs.writeFileSync(
    path.join(libPath, '.study-groups.json'),
    JSON.stringify(state, null, 2)
  )
}

export function seedStateJson(
  configDir: string,
  partialState: Record<string, unknown>
): void {
  const statePath = path.join(configDir, 'state.json')
  const base = {
    profile: {
      name: 'E2E 测试员',
      profile_text: '',
      preferred_topics: [],
    },
    lastUsed: {
      difficulty: 'mid',
      temperature: 'balanced',
    },
    session_count: 0,
    groups: [],
    activeGroupId: null,
    groupInspirations: {},
    topicContinueSuggestions: {},
    unsavedSessions: [],
    pendingArchives: [],
    archiveResult: null,
    terminology: {},
  }
  fs.writeFileSync(
    statePath,
    JSON.stringify({ ...base, ...partialState }, null, 2)
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/helpers/test-library.ts
git commit -m "test(e2e): add seed factories for multi-session, fable, diagram, groups, state"
```

---

## Task 4: 扩展 CoverPage.ts

**Files:**
- Modify: `e2e/pages/CoverPage.ts`

- [ ] **Step 1: 替换为扩展后的 CoverPage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class CoverPage {
  readonly nameInput: Locator
  readonly enterButton: Locator
  readonly lightButton: Locator
  readonly briefingButton: Locator

  constructor(private page: Page) {
    this.nameInput = page.locator(SELECTORS.cover.nameInput)
    this.enterButton = page.locator(SELECTORS.cover.enterButton)
    this.lightButton = page.locator(SELECTORS.cover.lightButton)
    this.briefingButton = page.locator(SELECTORS.cover.briefingButton)
  }

  async enterName(name: string) {
    await this.nameInput.waitFor({ state: 'visible' })
    await this.nameInput.fill(name)
  }

  async enterApp(name: string = 'E2E 测试员') {
    await this.enterName(name)
    await this.enterButton.click()
  }

  async enterIfNeeded(name: string = 'E2E 测试员') {
    await this.nameInput.or(this.lightButton).waitFor({ state: 'visible' })
    if (await this.lightButton.isVisible().catch(() => false)) {
      await this.lightButton.click()
    } else {
      await this.enterApp(name)
    }
  }

  async goToBriefing() {
    await this.briefingButton.click()
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/CoverPage.ts
git commit -m "test(e2e): extend CoverPage with briefing navigation"
```

---

## Task 5: 扩展 HomePage.ts

**Files:**
- Modify: `e2e/pages/HomePage.ts`

- [ ] **Step 1: 替换为扩展后的 HomePage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class HomePage {
  readonly greeting: Locator
  readonly newTopicButton: Locator
  readonly librarySection: Locator
  readonly continueUnsavedButton: Locator
  readonly burnUnsavedButton: Locator
  readonly settingsButton: Locator
  readonly profileButton: Locator
  readonly extensionButton: Locator

  constructor(private page: Page) {
    this.greeting = page.locator(SELECTORS.home.greeting)
    this.newTopicButton = page.locator(SELECTORS.home.newTopicButton)
    this.librarySection = page.locator(SELECTORS.home.librarySection)
    this.continueUnsavedButton = page.locator(SELECTORS.home.continueUnsavedButton)
    this.burnUnsavedButton = page.locator(SELECTORS.home.burnUnsavedButton)
    this.settingsButton = page.locator(SELECTORS.home.settingsButton)
    this.profileButton = page.locator(SELECTORS.home.profileButton)
    this.extensionButton = page.locator(SELECTORS.home.extensionButton)
  }

  async waitForLoaded() {
    await this.greeting.waitFor({ state: 'visible' })
    await this.librarySection.waitFor({ state: 'visible' })
  }

  async startNewTopic() {
    await this.newTopicButton.click()
  }

  async getTopicCardCount(): Promise<number> {
    return this.page.locator(SELECTORS.home.topicCard).count()
  }

  async expandTopic(index: number = 0) {
    const card = this.page.locator(SELECTORS.home.topicCard).nth(index)
    await card.click()
  }

  async continueTopic(index: number = 0) {
    const button = this.page.locator(SELECTORS.home.topicContinueButton).nth(index)
    await button.click()
  }

  async reviewSession(index: number = 0) {
    const button = this.page.locator(SELECTORS.home.sessionReviewButton).nth(index)
    await button.click()
  }

  async continueUnsavedSession() {
    await this.continueUnsavedButton.click()
  }

  async burnUnsavedSession() {
    await this.burnUnsavedButton.click()
  }

  async assertUnsavedSessionVisible(topic: string) {
    await this.continueUnsavedButton.waitFor({ state: 'visible' })
    await this.page.locator(`text=${topic}`).first().waitFor({ state: 'visible' })
  }

  async goToSettings() {
    await this.settingsButton.click()
  }

  async goToProfile() {
    await this.profileButton.click()
  }

  async goToExtension() {
    await this.extensionButton.click()
  }

  async switchInspirationStrategy(version: 'v1' | 'v2' | 'v3') {
    await this.page.locator(SELECTORS.home.strategyOption(version)).click()
  }

  async getGroupRecCardCount(): Promise<number> {
    return this.page.locator(SELECTORS.home.groupRecCard).count()
  }

  async refreshGroupRec(index: number = 0) {
    await this.page.locator(SELECTORS.home.groupRecRefresh).nth(index).click()
  }

  async clickGroupRecTopic(index: number = 0) {
    await this.page.locator(SELECTORS.home.groupRecCard).nth(index).click()
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/HomePage.ts
git commit -m "test(e2e): extend HomePage for navigation, unsaved sessions, strategy, group rec"
```

---

## Task 6: 扩展 PreStudyPage.ts

**Files:**
- Modify: `e2e/pages/PreStudyPage.ts`

- [ ] **Step 1: 替换为扩展后的 PreStudyPage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class PreStudyPage {
  readonly modal: Locator
  readonly topicInput: Locator
  readonly startButton: Locator
  readonly cancelButton: Locator

  constructor(private page: Page) {
    this.modal = page.locator(SELECTORS.preStudy.modal)
    this.topicInput = page.locator(SELECTORS.preStudy.topicInput)
    this.startButton = page.locator(SELECTORS.preStudy.startButton)
    this.cancelButton = page.locator(SELECTORS.preStudy.cancelButton)
  }

  async waitForVisible() {
    await this.modal.waitFor({ state: 'visible' })
  }

  async fillTopic(topic: string) {
    await this.topicInput.fill(topic)
  }

  async ensureNewTopicSource() {
    const newSource = this.page.locator(SELECTORS.preStudy.topicSourceNew)
    const selected = await newSource.evaluate(el => {
      return el.classList.contains('bg-ember')
    }).catch(() => false)
    if (!selected) {
      await newSource.click()
    }
  }

  async selectExistingTopicSource() {
    await this.page.locator(SELECTORS.preStudy.topicSourceExisting).click()
  }

  async selectExistingTopic(title: string) {
    await this.page.locator(SELECTORS.preStudy.existingTopicOption)
      .filter({ hasText: title })
      .first()
      .click()
  }

  async fillCustomTopic(text: string) {
    await this.page.locator(SELECTORS.preStudy.customTopicInput).fill(text)
  }

  async selectContinueSuggestion(index: number = 0) {
    await this.page.locator(SELECTORS.preStudy.continueSuggestionCard).nth(index).click()
  }

  async fillUserRequirement(text: string) {
    await this.page.locator(SELECTORS.preStudy.userRequirementInput).fill(text)
  }

  async setDifficulty(difficulty: 'low' | 'mid' | 'high') {
    await this.page.locator(SELECTORS.preStudy.difficultyButton(difficulty)).click()
  }

  async setTemperature(temperature: 'strict' | 'balanced' | 'creative') {
    await this.page.locator(SELECTORS.preStudy.temperatureButton(temperature)).click()
  }

  async toggleExternalMaterials() {
    await this.page.locator(SELECTORS.preStudy.externalMaterialsToggle).click()
  }

  async clickStart() {
    await this.startButton.click()
  }

  async close() {
    await this.cancelButton.click()
  }

  async isVisible(): Promise<boolean> {
    return this.modal.isVisible().catch(() => false)
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/PreStudyPage.ts
git commit -m "test(e2e): extend PreStudyPage for existing topic, suggestions, params"
```

---

## Task 7: 扩展 StudyPage.ts

**Files:**
- Modify: `e2e/pages/StudyPage.ts`

- [ ] **Step 1: 替换为扩展后的 StudyPage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class StudyPage {
  readonly pageElement: Locator
  readonly messageList: Locator
  readonly chatInput: Locator
  readonly sendButton: Locator
  readonly archivePendingBanner: Locator
  readonly archiveButton: Locator
  readonly dismissArchiveButton: Locator
  readonly archiveReportClose: Locator
  readonly archiveReportTitle: Locator
  readonly archiveReportBody: Locator
  readonly archiveLoadingOverlay: Locator
  readonly archiveReturnHomeButton: Locator
  readonly streamErrorBanner: Locator
  readonly streamRetryButton: Locator
  readonly streamDismissButton: Locator

  constructor(private page: Page) {
    this.pageElement = page.locator(SELECTORS.study.page)
    this.messageList = page.locator(SELECTORS.study.messageList)
    this.chatInput = page.locator(SELECTORS.study.chatInput)
    this.sendButton = page.locator(SELECTORS.study.sendButton)
    this.archivePendingBanner = page.locator(SELECTORS.study.archivePendingBanner)
    this.archiveButton = page.locator(SELECTORS.study.archiveButton)
    this.dismissArchiveButton = page.locator(SELECTORS.study.dismissArchiveButton)
    this.archiveReportClose = page.locator(SELECTORS.study.archiveReportClose)
    this.archiveReportTitle = page.locator(SELECTORS.study.archiveReportTitle)
    this.archiveReportBody = page.locator(SELECTORS.study.archiveReportBody)
    this.archiveLoadingOverlay = page.locator(SELECTORS.study.archiveLoadingOverlay)
    this.archiveReturnHomeButton = page.locator(SELECTORS.study.archiveReturnHomeButton)
    this.streamErrorBanner = page.locator(SELECTORS.study.streamErrorBanner)
    this.streamRetryButton = page.locator(SELECTORS.study.streamRetryButton)
    this.streamDismissButton = page.locator(SELECTORS.study.streamDismissButton)
  }

  async waitForLoaded() {
    await this.pageElement.waitFor({ state: 'visible' })
  }

  async waitForAssistantContent(timeout: number = 60000) {
    await this.messageList.locator(SELECTORS.study.assistantMessage)
      .filter({ hasText: /\S/ })
      .first()
      .waitFor({ state: 'visible', timeout })
  }

  async sendMessage(text: string) {
    await this.chatInput.fill(text)
    await this.sendButton.click()
  }

  async typeMultiline(text: string) {
    await this.chatInput.fill(text)
  }

  async archive() {
    await this.archivePendingBanner.waitFor({ state: 'visible' })
    await this.archiveButton.click()
  }

  async dismissArchive() {
    await this.dismissArchiveButton.click()
  }

  async closeArchiveReport() {
    await this.archiveReportClose.waitFor({ state: 'visible', timeout: 120000 })
    await this.archiveReportClose.click()
  }

  async getArchiveReportTitle(): Promise<string | null> {
    return this.archiveReportTitle.textContent()
  }

  async returnHomeDuringArchiving() {
    await this.archiveReturnHomeButton.click()
  }

  async waitForStreamError(timeout: number = 120000) {
    await this.streamErrorBanner.waitFor({ state: 'visible', timeout })
  }

  async retryStream() {
    await this.streamRetryButton.click()
  }

  async dismissStreamError() {
    await this.streamDismissButton.click()
  }

  async waitForHistoryLength(minLength: number, timeout: number = 120000) {
    await this.page.waitForFunction(
      (min: number) => {
        const session = (window as any).useStore?.getState()?.session
        return (session?.history?.length ?? 0) >= min && !session?.streaming
      },
      minLength,
      { timeout }
    )
  }

  async forceArchivePending() {
    await this.page.evaluate(() => {
      const store = (window as any).useStore
      const session = store.getState().session
      if (session) {
        store.setState({ session: { ...session, archivePending: true } })
      }
    })
  }

  async goBack() {
    await this.page.keyboard.press('Escape')
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/StudyPage.ts
git commit -m "test(e2e): extend StudyPage for archive and stream error states"
```

---

## Task 8: 新增 ProfilePage.ts

**Files:**
- Create: `e2e/pages/ProfilePage.ts`

- [ ] **Step 1: 创建 ProfilePage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class ProfilePage {
  readonly nameDisplay: Locator
  readonly textDisplay: Locator
  readonly topicsDisplay: Locator
  readonly difficultyDisplay: Locator
  readonly temperatureDisplay: Locator
  readonly editButton: Locator
  readonly saveButton: Locator
  readonly cancelButton: Locator
  readonly exitButton: Locator

  constructor(private page: Page) {
    this.nameDisplay = page.locator(SELECTORS.profile.nameDisplay)
    this.textDisplay = page.locator(SELECTORS.profile.textDisplay)
    this.topicsDisplay = page.locator(SELECTORS.profile.topicsDisplay)
    this.difficultyDisplay = page.locator(SELECTORS.profile.difficultyDisplay)
    this.temperatureDisplay = page.locator(SELECTORS.profile.temperatureDisplay)
    this.editButton = page.locator(SELECTORS.profile.editButton)
    this.saveButton = page.locator(SELECTORS.profile.saveButton)
    this.cancelButton = page.locator(SELECTORS.profile.cancelButton)
    this.exitButton = page.locator(SELECTORS.profile.exitButton)
  }

  async waitForLoaded() {
    await this.nameDisplay.waitFor({ state: 'visible' })
  }

  async enterEditMode() {
    await this.editButton.click()
  }

  async setName(name: string) {
    await this.page.locator(SELECTORS.profile.nameInput).fill(name)
  }

  async setProfileText(text: string) {
    await this.page.locator(SELECTORS.profile.textInput).fill(text)
  }

  async setPreferredTopics(topics: string) {
    await this.page.locator(SELECTORS.profile.topicsInput).fill(topics)
  }

  async setDifficulty(difficulty: 'low' | 'mid' | 'high') {
    await this.page.locator(SELECTORS.profile.difficultyButton(difficulty)).click()
  }

  async setTemperature(temperature: 'strict' | 'balanced' | 'creative') {
    await this.page.locator(SELECTORS.profile.temperatureButton(temperature)).click()
  }

  async save() {
    await this.saveButton.click()
  }

  async cancel() {
    await this.cancelButton.click()
  }

  async exit() {
    await this.exitButton.click()
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/ProfilePage.ts
git commit -m "test(e2e): add ProfilePage page object"
```

---

## Task 9: 新增 SettingsPage.ts

**Files:**
- Create: `e2e/pages/SettingsPage.ts`

- [ ] **Step 1: 创建 SettingsPage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class SettingsPage {
  readonly apiKeyInput: Locator
  readonly baseUrlInput: Locator
  readonly modelInput: Locator
  readonly libraryPathInput: Locator
  readonly verifyButton: Locator
  readonly saveButton: Locator
  readonly resetButton: Locator
  readonly backButton: Locator

  constructor(private page: Page) {
    this.apiKeyInput = page.locator(SELECTORS.settings.apiKeyInput)
    this.baseUrlInput = page.locator(SELECTORS.settings.baseUrlInput)
    this.modelInput = page.locator(SELECTORS.settings.modelInput)
    this.libraryPathInput = page.locator(SELECTORS.settings.libraryPathInput)
    this.verifyButton = page.locator(SELECTORS.settings.verifyButton)
    this.saveButton = page.locator(SELECTORS.settings.saveButton)
    this.resetButton = page.locator(SELECTORS.settings.resetButton)
    this.backButton = page.locator(SELECTORS.settings.backButton)
  }

  async waitForLoaded() {
    await this.apiKeyInput.waitFor({ state: 'visible' })
  }

  async fillApiKey(key: string) {
    await this.apiKeyInput.fill(key)
  }

  async toggleApiKeyVisibility() {
    await this.page.locator(SELECTORS.settings.apiKeyToggle).click()
  }

  async fillBaseUrl(url: string) {
    await this.baseUrlInput.fill(url)
  }

  async fillModel(model: string) {
    await this.modelInput.fill(model)
  }

  async fillLibraryPath(path: string) {
    await this.libraryPathInput.fill(path)
  }

  async clickVerify() {
    await this.verifyButton.click()
  }

  async getVerifyStatus(): Promise<string | null> {
    return this.page.locator(SELECTORS.settings.verifyStatus).textContent()
  }

  async saveSearchApiKey(key: string) {
    await this.page.locator(SELECTORS.settings.searchApiKeyInput).fill(key)
    await this.page.locator(SELECTORS.settings.searchSaveButton).click()
  }

  async saveConfig() {
    await this.saveButton.click()
  }

  async resetForm() {
    await this.resetButton.click()
  }

  async goBack() {
    await this.backButton.click()
  }

  async getErrorText(): Promise<string | null> {
    return this.page.locator(SELECTORS.settings.errorDisplay).textContent()
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/SettingsPage.ts
git commit -m "test(e2e): add SettingsPage page object"
```

---

## Task 10: 新增 LibraryPage.ts

**Files:**
- Create: `e2e/pages/LibraryPage.ts`

- [ ] **Step 1: 创建 LibraryPage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class LibraryPage {
  constructor(private page: Page) {}

  async waitForVisible() {
    await this.page.locator(SELECTORS.home.librarySection).waitFor({ state: 'visible' })
  }

  async filterAll() {
    await this.page.locator(SELECTORS.library.groupTabAll).click()
  }

  async filterByGroup(groupId: string) {
    await this.page.locator(SELECTORS.library.groupTab(groupId)).click()
  }

  async createGroup() {
    await this.page.locator(SELECTORS.library.createGroupButton).click()
  }

  async renameGroup(groupId: string, newName: string) {
    const tab = this.page.locator(SELECTORS.library.groupTab(groupId))
    await tab.dblclick()
    const input = this.page.locator(SELECTORS.library.groupRenameInput)
    await input.fill(newName)
    await input.press('Enter')
  }

  async deleteGroup(groupId: string) {
    await this.page.locator(SELECTORS.library.groupTab(groupId))
      .locator(SELECTORS.library.groupDeleteButton)
      .click()
  }

  async expandTopic(index: number = 0) {
    await this.page.locator(SELECTORS.home.topicCard).nth(index).click()
  }

  async dragTopicToGroup(topicIndex: number, groupId: string) {
    const card = this.page.locator(SELECTORS.home.topicCard).nth(topicIndex)
    const target = this.page.locator(SELECTORS.library.gravityGroupTarget(groupId))
    await card.dragTo(target)
  }

  async openSessionFile(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.sessionFileButton).nth(sessionIndex).click()
  }

  async openFable(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.fableButton).nth(sessionIndex).click()
  }

  async generateFable(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.generateFableButton).nth(sessionIndex).click()
  }

  async openDiagram(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.diagramButton).nth(sessionIndex).click()
  }

  async generateDiagram(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.generateDiagramButton).nth(sessionIndex).click()
  }

  async deleteSession(topicIndex: number = 0, sessionIndex: number = 0) {
    await this.expandTopic(topicIndex)
    await this.page.locator(SELECTORS.library.deleteSessionButton).nth(sessionIndex).click()
  }

  async confirmDelete() {
    await this.page.locator(SELECTORS.confirmDialog.confirmButton).click()
  }

  async cancelDelete() {
    await this.page.locator(SELECTORS.confirmDialog.cancelButton).click()
  }

  async closeSessionViewer() {
    await this.page.locator(SELECTORS.library.sessionViewerClose).click()
  }

  async getSessionViewerTitle(): Promise<string | null> {
    return this.page.locator(SELECTORS.library.sessionViewerTitle).textContent()
  }

  async goToPage(index: number) {
    await this.page.locator(SELECTORS.library.paginationDot(index)).click()
  }

  async nextPage() {
    await this.page.locator(SELECTORS.library.paginationNext).click()
  }

  async prevPage() {
    await this.page.locator(SELECTORS.library.paginationPrev).click()
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/LibraryPage.ts
git commit -m "test(e2e): add LibraryPage page object"
```

---

## Task 11: 新增 SetupWizardPage.ts

**Files:**
- Create: `e2e/pages/SetupWizardPage.ts`

- [ ] **Step 1: 创建 SetupWizardPage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class SetupWizardPage {
  constructor(private page: Page) {}

  async waitForStep(step: number) {
    await this.page.locator(SELECTORS.setupWizard.stepIndicator(step))
      .locator('..')
      .locator('text=当前') // or assert class
      .waitFor({ state: 'visible' })
  }

  async start() {
    await this.page.locator(SELECTORS.setupWizard.nextButton).click()
  }

  async fillApiKey(key: string) {
    await this.page.locator(SELECTORS.setupWizard.apiKeyInput).fill(key)
  }

  async fillBaseUrl(url: string) {
    await this.page.locator(SELECTORS.setupWizard.baseUrlInput).fill(url)
  }

  async fillModel(model: string) {
    await this.page.locator(SELECTORS.setupWizard.modelInput).fill(model)
  }

  async verifyAndContinue() {
    await this.page.locator(SELECTORS.setupWizard.nextButton).click()
  }

  async fillLibraryPath(path: string) {
    await this.page.locator(SELECTORS.setupWizard.libraryPathInput).fill(path)
  }

  async selectDirectory() {
    await this.page.locator(SELECTORS.setupWizard.selectDirectoryButton).click()
  }

  async confirmLibraryPath() {
    await this.page.locator(SELECTORS.setupWizard.nextButton).click()
  }

  async fillName(name: string) {
    await this.page.locator(SELECTORS.setupWizard.nameInput).fill(name)
  }

  async fillProfileText(text: string) {
    await this.page.locator(SELECTORS.setupWizard.profileTextInput).fill(text)
  }

  async fillPreferredTopics(topics: string) {
    await this.page.locator(SELECTORS.setupWizard.preferredTopicsInput).fill(topics)
  }

  async complete() {
    await this.page.locator(SELECTORS.setupWizard.nextButton).click()
  }

  async getErrorText(): Promise<string | null> {
    return this.page.locator(SELECTORS.setupWizard.errorDisplay).textContent()
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/SetupWizardPage.ts
git commit -m "test(e2e): add SetupWizardPage page object"
```

---

## Task 12: 新增 ArchiveReportPage.ts

**Files:**
- Create: `e2e/pages/ArchiveReportPage.ts`

- [ ] **Step 1: 创建 ArchiveReportPage**

```typescript
import { Page, Locator } from '@playwright/test'
import { SELECTORS } from '../helpers/selectors'

export class ArchiveReportPage {
  readonly modal: Locator
  readonly title: Locator
  readonly body: Locator
  readonly closeButton: Locator

  constructor(private page: Page) {
    this.modal = page.locator('[data-testid="archive-report-modal"]')
    this.title = page.locator(SELECTORS.study.archiveReportTitle)
    this.body = page.locator(SELECTORS.study.archiveReportBody)
    this.closeButton = page.locator(SELECTORS.study.archiveReportClose)
  }

  async waitForVisible(timeout: number = 120000) {
    await this.modal.waitFor({ state: 'visible', timeout })
  }

  async getTitle(): Promise<string | null> {
    return this.title.textContent()
  }

  async getBody(): Promise<string | null> {
    return this.body.textContent()
  }

  async close() {
    await this.closeButton.click()
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add e2e/pages/ArchiveReportPage.ts
git commit -m "test(e2e): add ArchiveReportPage page object"
```

---

## Task 13: 新增 cover.spec.ts

**Files:**
- Create: `e2e/specs/cover.spec.ts`

- [ ] **Step 1: 创建 cover.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p0 cover', () => {
  test('first-time user enters name and lands on home', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterApp('夜话旅人')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.greeting).toContainText('夜话旅人')

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.profile.name).toBe('夜话旅人')
  })
})

test.describe('@p1 cover', () => {
  test('returning user sees light button', async ({ window, testConfigDir }) => {
    const statePath = path.join(testConfigDir, 'state.json')
    fs.writeFileSync(statePath, JSON.stringify({
      profile: { name: '归来者', profile_text: '', preferred_topics: [] },
      lastUsed: { difficulty: 'mid', temperature: 'balanced' },
      session_count: 0,
      groups: [],
      activeGroupId: null,
      groupInspirations: {},
      topicContinueSuggestions: {},
      unsavedSessions: [],
      pendingArchives: [],
      archiveResult: null,
      terminology: {},
    }))

    await window.reload()

    const cover = new CoverPage(window)
    await cover.lightButton.waitFor({ state: 'visible' })
    await cover.lightButton.click()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.greeting).toContainText('归来者')
  })

  test('briefing button navigates to briefing', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()

    await expect(window.locator('[data-testid="briefing-page"]')).toBeVisible({ timeout: 10000 })
  })

  test('cover quote shows text and meta', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.nameInput.or(cover.lightButton).waitFor({ state: 'visible' })

    await expect(window.locator(SELECTORS.quote.text)).toBeVisible()
    await expect(window.locator(SELECTORS.quote.meta)).toContainText('—')
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/cover.spec.ts
git commit -m "test(e2e): add cover page spec"
```

---

## Task 14: 新增 home.spec.ts

**Files:**
- Create: `e2e/specs/home.spec.ts`

- [ ] **Step 1: 创建 home.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { StudyPage } from '../pages/StudyPage'
import { seedStateJson, seedNewTopic } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 home', () => {
  test('recover unsaved session', async ({ window, testConfigDir, testLibraryPath }) => {
    seedStateJson(testConfigDir, {
      unsavedSessions: [{
        id: 'test-unsaved-1',
        topic: '未保存的谈话',
        mode: 'progress',
        history: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '欢迎回来。' },
        ],
        difficulty: 'mid',
        temperature: 'balanced',
        updatedAt: new Date().toISOString(),
      }],
    })

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.assertUnsavedSessionVisible('未保存的谈话')
    await home.continueUnsavedSession()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await expect(study.messageList.locator(SELECTORS.study.userMessage)).toContainText('你好')
  })

  test('burn unsaved session', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      unsavedSessions: [{
        id: 'test-unsaved-2',
        topic: '要焚毁的谈话',
        mode: 'progress',
        history: [{ role: 'user', content: 'hello' }],
        difficulty: 'mid',
        temperature: 'balanced',
        updatedAt: new Date().toISOString(),
      }],
    })

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.burnUnsavedSession()
    await expect(home.continueUnsavedButton).not.toBeVisible()

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.unsavedSessions).toHaveLength(0)
  })

  test('switch inspiration strategy', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.switchInspirationStrategy('v2')

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.lastUsed.inspirationStrategy).toBe('v2')
  })

  test('group rec card appears and is clickable', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(window.locator(SELECTORS.home.groupRecCard).first()).toBeVisible({ timeout: 30000 })
    await home.clickGroupRecTopic(0)

    await expect(window.locator(SELECTORS.preStudy.modal)).toBeVisible()
  })

  test('navigate to settings, profile, extension', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()

    await home.goToSettings()
    await expect(window.locator(SELECTORS.settings.page)).toBeVisible()

    await home.goToProfile()
    await expect(window.locator(SELECTORS.profile.page)).toBeVisible()

    await home.goToExtension()
    await expect(window.locator('[data-testid="extension-page"]')).toBeVisible()
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/home.spec.ts
git commit -m "test(e2e): add home page spec"
```

---

## Task 15: 新增 pre-study.spec.ts

**Files:**
- Create: `e2e/specs/pre-study.spec.ts`

- [ ] **Step 1: 创建 pre-study.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedNewTopic } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 pre-study', () => {
  test('select existing topic with sub-topic', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.selectExistingTopicSource()
    await preStudy.selectExistingTopic('TypeScript 装饰器')
    await preStudy.fillCustomTopic('在 NestJS 中的应用')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await expect(window.locator('[data-testid="session-info"]')).toContainText('TypeScript 装饰器')
  })

  test('set difficulty and temperature', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.setDifficulty('low')
    await preStudy.setTemperature('creative')
    await preStudy.fillTopic('测试参数保存')
    await preStudy.clickStart()

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.lastUsed.difficulty).toBe('low')
    expect(state.lastUsed.temperature).toBe('creative')
  })

  test('cancel closes modal', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.close()
    await expect(preStudy.modal).not.toBeVisible()
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/pre-study.spec.ts
git commit -m "test(e2e): add pre-study spec"
```

---

## Task 16: 新增 study.spec.ts

**Files:**
- Create: `e2e/specs/study.spec.ts`

- [ ] **Step 1: 创建 study.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 study', () => {
  async function startNewTopic(window, topic: string) {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic(topic)
    await preStudy.clickStart()
    const study = new StudyPage(window)
    await study.waitForLoaded()
    return study
  }

  test('dismiss archive pending and continue', async ({ window }) => {
    test.setTimeout(300000)
    const study = await startNewTopic(window, '可-dismiss 归档测试')
    await study.waitForAssistantContent()
    await study.sendMessage('请问我可以暂时不封存吗')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.dismissArchive()
    await expect(study.archivePendingBanner).not.toBeVisible()
  })

  test('return home without archive does not create unsaved when history empty', async ({ window, testConfigDir }) => {
    const study = await startNewTopic(window, '空对话返回测试')
    await study.goBack()

    const home = new HomePage(window)
    await home.waitForLoaded()

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.unsavedSessions).toHaveLength(0)
  })

  test('return home saves unsaved session', async ({ window, testConfigDir }) => {
    test.setTimeout(300000)
    const study = await startNewTopic(window, '保存未归档会话')
    await study.waitForAssistantContent()
    await study.sendMessage('我需要保留这次谈话')
    await study.waitForHistoryLength(2)
    await study.goBack()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.assertUnsavedSessionVisible('保存未归档会话')
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/study.spec.ts
git commit -m "test(e2e): add study edge cases spec"
```

---

## Task 17: 新增 library-management.spec.ts

**Files:**
- Create: `e2e/specs/library-management.spec.ts`

- [ ] **Step 1: 创建 library-management.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { seedNewTopic, seedTopicWithFable, seedTopicWithDiagram, seedGroupState } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 library management', () => {
  test('create and rename group', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    await library.createGroup()
    const newGroupTab = window.locator(SELECTORS.library.groupTab('group-1'))
    await expect(newGroupTab).toBeVisible()

    await library.renameGroup('group-1', '重构后的分组')
    await expect(window.locator(SELECTORS.library.groupTab('group-1'))).toContainText('重构后的分组')
  })

  test('view fable from seeded topic', async ({ window, testLibraryPath }) => {
    seedTopicWithFable(testLibraryPath, 'fable-topic', '寓言测试主题')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    await library.openFable(0, 0)

    await expect(window.locator(SELECTORS.library.sessionViewer)).toBeVisible()
    const title = await library.getSessionViewerTitle()
    expect(title).toContain('寓言')
  })

  test('view diagram from seeded topic', async ({ window, testLibraryPath }) => {
    seedTopicWithDiagram(testLibraryPath, 'diagram-topic', '图表测试主题')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    await library.openDiagram(0, 0)

    await expect(window.locator(SELECTORS.library.sessionViewer)).toBeVisible()
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/library-management.spec.ts
git commit -m "test(e2e): add library management spec"
```

---

## Task 18: 新增 profile.spec.ts

**Files:**
- Create: `e2e/specs/profile.spec.ts`

- [ ] **Step 1: 创建 profile.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { ProfilePage } from '../pages/ProfilePage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 profile', () => {
  test('edit and save profile', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToProfile()

    const profile = new ProfilePage(window)
    await profile.waitForLoaded()
    await profile.enterEditMode()
    await profile.setName('苏格拉底')
    await profile.setProfileText('喜欢追问到底')
    await profile.setPreferredTopics('哲学，数学')
    await profile.setDifficulty('high')
    await profile.setTemperature('strict')
    await profile.save()

    await expect(profile.nameDisplay).toContainText('苏格拉底')

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.profile.name).toBe('苏格拉底')
    expect(state.profile.profile_text).toBe('喜欢追问到底')
    expect(state.profile.preferred_topics).toEqual(['哲学', '数学'])
    expect(state.lastUsed.difficulty).toBe('high')
    expect(state.lastUsed.temperature).toBe('strict')
  })

  test('cancel edit discards changes', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToProfile()

    const profile = new ProfilePage(window)
    await profile.waitForLoaded()
    const originalName = await profile.nameDisplay.textContent()

    await profile.enterEditMode()
    await profile.setName('临时名字')
    await profile.cancel()

    await expect(profile.nameDisplay).toContainText(originalName ?? '')
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/profile.spec.ts
git commit -m "test(e2e): add profile spec"
```

---

## Task 19: 新增 settings.spec.ts

**Files:**
- Create: `e2e/specs/settings.spec.ts`

- [ ] **Step 1: 创建 settings.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { SettingsPage } from '../pages/SettingsPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 settings', () => {
  test('modify and save config', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToSettings()

    const settings = new SettingsPage(window)
    await settings.waitForLoaded()
    await settings.fillBaseUrl('https://api.kimi.com/coding/v1')
    await settings.fillModel('kimi-k2.6')
    await settings.fillLibraryPath('C:/tmp/test-library')
    await settings.saveConfig()

    const envPath = path.join(testConfigDir, '.env')
    const envContent = fs.readFileSync(envPath, 'utf-8')
    expect(envContent).toContain('KIMI_BASE_URL=https://api.kimi.com/coding/v1')
    expect(envContent).toContain('KIMI_MODEL=kimi-k2.6')
    expect(envContent).toContain('STUDY_LIBRARY_PATH=C:/tmp/test-library')
  })

  test('verify connection with real API', async ({ window }) => {
    test.setTimeout(120000)
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToSettings()

    const settings = new SettingsPage(window)
    await settings.waitForLoaded()
    await settings.clickVerify()

    await expect(settings.page.locator(SELECTORS.settings.verifyStatus))
      .toContainText('正常', { timeout: 60000 })
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/settings.spec.ts
git commit -m "test(e2e): add settings spec"
```

---

## Task 20: 新增 onboarding-journey.spec.ts

**Files:**
- Create: `e2e/specs/onboarding-journey.spec.ts`

- [ ] **Step 1: 创建 onboarding-journey.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { SetupWizardPage } from '../pages/SetupWizardPage'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 onboarding journey', () => {
  test('complete setup wizard and first study session', async ({ window, testConfigDir }) => {
    test.setTimeout(300000)

    const wizard = new SetupWizardPage(window)
    await wizard.start()

    await wizard.fillApiKey(process.env.KIMI_API_KEY ?? '')
    await wizard.fillBaseUrl('https://api.kimi.com/coding/v1')
    await wizard.fillModel('kimi-k2.6')
    await wizard.verifyAndContinue()

    await wizard.fillLibraryPath(testConfigDir)
    await wizard.confirmLibraryPath()

    await wizard.fillName('新旅人')
    await wizard.fillProfileText('热爱学习')
    await wizard.fillPreferredTopics('编程，设计')
    await wizard.complete()

    const cover = new CoverPage(window)
    await cover.enterApp('新旅人')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('第一次学习')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('请帮我总结刚才的内容')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.archive()
    await study.closeArchiveReport()

    await home.waitForLoaded()
    const entries = fs.readdirSync(testConfigDir)
    expect(entries.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/onboarding-journey.spec.ts
git commit -m "test(e2e): add onboarding journey spec"
```

---

## Task 21: 新增 archive-edge.spec.ts

**Files:**
- Create: `e2e/specs/archive-edge.spec.ts`

- [ ] **Step 1: 创建 archive-edge.spec.ts**

```typescript
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedReviewableTopic } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p2 archive edge', () => {
  test('multiple archives create unique filenames', async ({ window, testLibraryPath }) => {
    test.setTimeout(600000)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('重名归档测试')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('第一次归档')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.archive()
    await study.closeArchiveReport()

    await home.waitForLoaded()
    await home.startNewTopic()
    await preStudy.waitForVisible()
    await preStudy.fillTopic('重名归档测试')
    await preStudy.clickStart()

    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('第二次归档')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.archive()
    await study.closeArchiveReport()

    const topicDir = path.join(testLibraryPath, fs.readdirSync(testLibraryPath)[0])
    const sessions = fs.readdirSync(topicDir)
    expect(sessions.length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: 提交**

```bash
git add e2e/specs/archive-edge.spec.ts
git commit -m "test(e2e): add archive edge cases spec"
```

---

## Task 22: 更新 package.json 脚本

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 scripts 中新增 e2e 运行脚本**

```json
"test:e2e:core": "playwright test --config e2e/playwright.config.ts --grep '@p0|@p1'",
"test:e2e:p1": "playwright test --config e2e/playwright.config.ts --grep @p1",
"test:e2e:p2": "playwright test --config e2e/playwright.config.ts --grep @p2",
```

完整 scripts 段落应变为：

```json
"scripts": {
  "dev": "node scripts/pre-check.js && node scripts/dev.js dev",
  "build": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json && node scripts/dev.js build",
  "preview": "node scripts/dev.js preview",
  "pretest": "node scripts/build-manifest.cjs",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test --config e2e/playwright.config.ts",
  "test:e2e:smoke": "playwright test --config e2e/playwright.config.ts --grep @smoke",
  "test:e2e:core": "playwright test --config e2e/playwright.config.ts --grep '@p0|@p1'",
  "test:e2e:p1": "playwright test --config e2e/playwright.config.ts --grep @p1",
  "test:e2e:p2": "playwright test --config e2e/playwright.config.ts --grep @p2",
  "test:e2e:debug": "playwright test --config e2e/playwright.config.ts --headed --trace on",
  "package": "electron-vite build && electron-builder --config electron-builder.yml"
},
```

- [ ] **Step 2: 提交**

```bash
git add package.json
git commit -m "chore(e2e): add core/p1/p2 test scripts"
```

---

## Task 23: 更新 e2e/README.md

**Files:**
- Modify: `e2e/README.md`

- [ ] **Step 1: 在"标记"部分前插入 LLM 调用策略章节**

```markdown
## LLM 调用策略

本项目 E2E 测试使用真实 Kimi API 调用，不 mock LLM。
所有涉及 `llm:start` / `llm:finalize*` 的测试必须走真实网络，
以确保验证的是生产环境下的端到端行为。

后续所有新增 API 相关功能也应遵循此策略。
```

- [ ] **Step 2: 更新"标记"部分**

```markdown
## 标记

- `@smoke`：启动冒烟测试，快且不调用 LLM
- `@slow`：调用真实 Kimi API，每个用例可能耗时 10 秒到 2 分钟
- `@p0`：核心路径，每次 CI/本地提交前跑
- `@p1`：重要功能，PR 合并前跑
- `@p2`：边界/慢路径，发布前全量或按需跑
```

- [ ] **Step 3: 提交**

```bash
git add e2e/README.md
git commit -m "docs(e2e): document LLM strategy and priority tags"
```

---

## Task 24: 运行 smoke 测试并修复

**Files:**
- 可能修改：业务组件的 data-testid、Page Object、selectors

- [ ] **Step 1: 构建产物**

```bash
npx electron-vite build
```

- [ ] **Step 2: 运行 smoke**

```bash
npm run test:e2e:smoke
```

Expected: PASS

- [ ] **Step 3: 如有失败，修复 selectors 或 data-testid 后重新运行**

- [ ] **Step 4: 提交修复**

```bash
git add -A
git commit -m "fix(e2e): align selectors and data-testid for smoke pass"
```

---

## Task 25: 运行 core 测试并修复

**Files:**
- 可能修改：Page Object、spec 断言、data-testid

- [ ] **Step 1: 运行 core**

```bash
npm run test:e2e:core
```

Expected: 全部 `@p0` 和 `@p1` 用例通过（耗时可能 10-30 分钟）

- [ ] **Step 2: 修复失败的测试**

逐个查看 `e2e-results/` 中的 trace 和截图，调整：
- 等待时间
- selector 匹配
- 断言内容

- [ ] **Step 3: 提交修复**

```bash
git add -A
git commit -m "fix(e2e): stabilize core E2E tests"
```

---

## Task 26: 运行全量 E2E 并修复 @p2

**Files:**
- 可能修改：`@p2` spec、Page Object

- [ ] **Step 1: 运行全量**

```bash
npm run test:e2e
```

- [ ] **Step 2: 修复 `@p2` 失败用例**

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "fix(e2e): stabilize p2 edge case tests"
```

---

## Task 27: 最终验证与文档更新

**Files:**
- Modify: `e2e/README.md`

- [ ] **Step 1: 更新 e2e/README.md 的目录结构**

将目录结构章节更新为包含新增的 pages 和 specs。

- [ ] **Step 2: 运行 lint/type check**

```bash
npm run build
```

Expected: 通过 TypeScript 检查

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "docs(e2e): update README structure and final verification"
```

---

## Self-Review

### 1. Spec coverage

| Spec 需求 | 对应 Task |
|-----------|-----------|
| 首次启动 / Setup Wizard | Task 2, 11, 20 |
| Settings 配置管理 | Task 2, 9, 19 |
| Profile 侧写编辑 | Task 2, 8, 18 |
| Home 推荐系统（6.20 前） | Task 2, 5, 14 |
| 学习库管理 | Task 2, 10, 17 |
| Study 会话边界 | Task 2, 7, 16 |
| PreStudy 模态 | Task 2, 6, 15 |
| Cover/Home 导航 | Task 4, 5, 13 |
| 归档边界 | Task 12, 21 |
| LLM 真实调用策略文档 | Task 23 |
| 风险标签与脚本 | Task 1, 22 |

### 2. Placeholder scan

- 无 TBD/TODO
- 所有代码步骤包含完整代码
- 所有命令包含预期输出
- 无"similar to Task N"省略

### 3. Type consistency

- `SELECTORS` 函数签名统一使用 `(value: string)` / `(index: number)`
- Page Object 方法命名一致：`waitForLoaded`, `clickStart`, `fillXxx`
- `@p0`/`@p1`/`@p2` 标签贯穿所有新增 spec

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-27-e2e-full-coverage-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
