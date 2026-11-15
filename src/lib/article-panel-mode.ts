import type { ArticlePanelMode, StateJson } from '@shared/index'

export function restoreArticlePanelMode(
  saved: StateJson['articlePanelMode'],
): Record<'anthropic' | 'book', ArticlePanelMode> {
  return {
    anthropic: saved?.anthropic === 'companion' ? 'companion' : 'guide',
    book: saved?.book === 'companion' ? 'companion' : 'guide',
  }
}
