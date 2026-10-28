// 博客对照挑选器资格判断：当前状态下，点来源栏「写作」是否应打开写作树挑选器
// （而非整页跳转到写作界面）。放 lib 而非组件文件——组件文件只导出组件（ui-styling §10）。

export type CompanionPickerKey = 'anthropic' | 'book'

// 窄结构参数：调用方（sidebar）从 store 取这几个字段组装，测试可直接造字面量。
export interface CompanionPickerState {
  briefingSource: string
  articlePanelMode: Partial<Record<CompanionPickerKey, 'guide' | 'companion'>>
  articleAssistantGuideCollapsed: boolean
  anthropicReaderFilePath: string | null
  /** 当前打开的章节绝对路径（书籍来源下判定是否有可对照的主文档） */
  activeBookChapterPath?: string | null
}

// 全部满足才可挑选：当前 source 是对照栏目 + 右栏处于对照 tab + 主区有在读文章/章节。
// collapsed 不再拒绝——由调用方（sidebar）先展开右栏再开挑选器（2026-10-22 落点统一）。
export function companionPickerTarget(s: CompanionPickerState): CompanionPickerKey | null {
  if (s.briefingSource === 'anthropic') {
    return s.articlePanelMode.anthropic === 'companion' && s.anthropicReaderFilePath ? 'anthropic' : null
  }
  if (s.briefingSource === 'book') {
    return s.articlePanelMode.book === 'companion' && s.activeBookChapterPath ? 'book' : null
  }
  return null
}
