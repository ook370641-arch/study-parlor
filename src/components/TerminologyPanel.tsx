import { useState } from 'react'
import { useStore } from '@/store'
import { useTerminology } from '@/lib/terminology'
import { DEFAULT_TERMINOLOGY } from '@/lib/terminology-defaults'
import type { Terminology } from '@shared/index'

const GROUPS: { title: string; keys: (keyof Terminology)[] }[] = [
  {
    title: '仪式动词',
    keys: [
      'sessionName',
      'libraryName',
      'archiveVerb',
      'transcriptName',
      'burnVerb',
      'newTopicLabel',
      'continuePrompt',
      'unsavedSessionLabel',
    ],
  },
  {
    title: '模式与流程',
    keys: [
      'modeProgress',
      'modeReview',
      'newTopicMode',
      'existingTopicMode',
      'archiveConfirmTitle',
      'archiveDismiss',
      'archiveConfirm',
    ],
  },
  {
    title: '参数标签',
    keys: [
      'difficultyLabel',
      'temperatureLabel',
      'difficultyHigh',
      'difficultyMid',
      'difficultyLow',
      'temperatureCold',
      'temperatureNeutral',
      'temperatureWarm',
    ],
  },
  {
    title: '界面名词',
    keys: [
      'profileNameLabel',
      'profileFieldLabel',
      'profileTextLabel',
      'topicInputLabel',
      'subTopicLabel',
      'continueDirectionLabel',
      'requirementLabel',
      'homeGreeting',
      'startButton',
      'cancelButton',
    ],
  },
]

export function TerminologyPanel() {
  const custom = useStore(s => s.terminology)
  const patchTerminology = useStore(s => s.patchTerminology)
  const resetTerminology = useStore(s => s.resetTerminology)
  const t = useTerminology()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    '仪式动词': true,
    '模式与流程': true,
    '参数标签': true,
  })

  const setGroupOpen = (title: string, open: boolean) => {
    setOpenGroups(prev => ({ ...prev, [title]: open }))
  }

  const handleChange = (key: keyof Terminology, value: string) => {
    void patchTerminology({ [key]: value } as Terminology)
  }

  const handleResetKey = (key: keyof Terminology) => {
    void patchTerminology({ [key]: undefined } as Terminology)
  }

  const hasCustom = (key: keyof Terminology) => custom[key] !== undefined && custom[key] !== ''

  return (
    <div data-testid="terminology-panel" className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-serif font-semibold">我的语言</h3>
        <button
          data-testid="terminology-reset-all"
          onClick={() => void resetTerminology()}
          className="text-xs text-parchment/50 hover:text-parchment font-sans transition-colors"
        >
          全部恢复默认
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {GROUPS.map(group => (
          <details
            key={group.title}
            open={openGroups[group.title] ?? false}
            onToggle={e => setGroupOpen(group.title, (e.target as HTMLDetailsElement).open)}
            className="bg-parchment/5 border border-slate/20 rounded-lg"
          >
            <summary className="px-4 py-2.5 text-sm font-sans text-parchment/80 cursor-pointer select-none list-none flex items-center justify-between">
              <span>{group.title}</span>
              <span className="text-parchment/40 text-xs">{openGroups[group.title] ? '收起' : '展开'}</span>
            </summary>
            <div className="px-4 pb-4 space-y-3">
              {group.keys.map(key => (
                <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
                  <div className="text-xs text-parchment/40 font-sans truncate">{DEFAULT_TERMINOLOGY[key]}</div>
                  <input
                    type="text"
                    data-testid={`terminology-input-${key}`}
                    value={custom[key] ?? ''}
                    onChange={e => handleChange(key, e.target.value)}
                    className="bg-ink/50 border border-slate/40 rounded px-2 py-1.5 text-sm text-parchment focus:outline-none focus:border-ember/60 font-sans"
                    placeholder={DEFAULT_TERMINOLOGY[key]}
                  />
                  <button
                    onClick={() => handleResetKey(key)}
                    data-testid={`terminology-reset-${key}`}
                    disabled={!hasCustom(key)}
                    className={`text-xs font-sans transition-colors ${
                      hasCustom(key)
                        ? 'text-parchment/40 hover:text-ember'
                        : 'text-parchment/20 cursor-default'
                    }`}
                  >
                    恢复
                  </button>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>

      <div data-testid="terminology-preview" className="mt-4 shrink-0 bg-ember/5 border border-ember/20 rounded-lg p-4">
        <div className="text-xs text-parchment/50 font-sans mb-2">实时预览</div>
        <div className="text-sm text-parchment font-sans">
          进入 <span className="text-ember">{t.sessionName}</span>
          {' · '}
          打开 <span className="text-ember">{t.libraryName}</span>
          {' · '}
          {t.difficultyLabel}：
          <span className="text-ember">{t.difficultyHigh}</span>
        </div>
      </div>
    </div>
  )
}
