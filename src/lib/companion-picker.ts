// 博客对照挑选器资格判断：当前状态下，点来源栏「写作」是否应打开写作树挑选器
// （而非整页跳转到写作界面）。放 lib 而非组件文件——组件文件只导出组件（ui-styling §10）。

export type CompanionPickerKey = 'anthropic'

// 窄结构参数：调用方（sidebar）从 store 取这几个字段组装，测试可直接造字面量。
export interface CompanionPickerState {
  briefingSource: string
  articlePanelMode: Record<CompanionPickerKey, 'guide' | 'companion'>
  articleAssistantGuideCollapsed: boolean
  anthropicReaderFilePath: string | null
}

// 全部满足才可挑选：当前 source 是博客栏目 + 右栏处于对照 tab
// + 右栏展开 + 主区有在读文章（对照需要主文作锚）。
export function companionPickerTarget(s: CompanionPickerState): CompanionPickerKey | null {
  if (s.articleAssistantGuideCollapsed) return null
  if (s.briefingSource === 'anthropic') {
    return s.articlePanelMode.anthropic === 'companion' && s.anthropicReaderFilePath ? 'anthropic' : null
  }
  return null
}
