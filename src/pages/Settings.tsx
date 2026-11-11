import { useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import { GeneralSettings } from '@/components/settings/GeneralSettings'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
import { ExtensionSettings } from '@/components/settings/ExtensionSettings'

type Primary = 'general' | 'profile' | 'extension'
type GeneralSection = 'ai' | 'appearance' | 'library'
type ExtensionSection = 'terminology' | 'paintings' | 'agent'

const PRIMARY_SECTIONS: { id: Primary; label: string; description: string }[] = [
  { id: 'general', label: '常规', description: '模型、界面与学习库' },
  { id: 'profile', label: '卷宗', description: '你的学习者侧写' },
  { id: 'extension', label: '扩展', description: '语言、配图与 Agent' },
]

const GENERAL_SECTIONS: { id: GeneralSection; label: string }[] = [
  { id: 'ai', label: 'AI 与搜索' },
  { id: 'appearance', label: '界面与画作' },
  { id: 'library', label: '学习库与归档' },
]

const EXTENSION_SECTIONS: { id: ExtensionSection; label: string }[] = [
  { id: 'terminology', label: '我的语言' },
  { id: 'paintings', label: '自选配图' },
  { id: 'agent', label: '本地 Agent 打通' },
]

export function Settings() {
  const goto = useStore(s => s.goto)
  const settingsReturnTo = useStore(s => s.settingsReturnTo)
  const showToast = useStore(s => s.showToast)
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  const [primary, setPrimary] = useState<Primary>('general')
  const [generalSection, setGeneralSection] = useState<GeneralSection>('ai')
  const [extensionSection, setExtensionSection] = useState<ExtensionSection>('terminology')
  const [error, setError] = useState<string | null>(null)

  return (
    <div data-testid="settings-page" className={`fixed inset-0 ${isAcademic ? '' : 'bg-[#f5f2ed]'}`}>
      <SurfaceBackground surface="home" />
      <StudyControlsGroup surface="home" className="absolute top-4 right-4 z-10" />

      <div className="absolute top-10 left-6 right-6 bottom-5 z-10">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          <div className={`${isAcademic ? 'bg-ink/72' : 'bg-white'} backdrop-blur-md border ${isAcademic ? 'border-slate/30' : 'border-[#1a1a1a]/10'} rounded-xl flex flex-col h-full overflow-hidden`}>
            <div className={`flex justify-between items-center px-6 pt-5 pb-3 border-b ${isAcademic ? 'border-slate/25' : 'border-[#1a1a1a]/10'} shrink-0`}>
              <h2 className="text-2xl font-serif font-semibold">设置 · 仪器调校</h2>
              <button
                data-testid="settings-back-button"
                onClick={() => goto(settingsReturnTo ?? 'home')}
                className={`${isAcademic ? 'text-parchment/70 hover:text-parchment' : 'text-[#555] hover:text-[#1a1a1a]'} text-sm bg-transparent border-none cursor-pointer font-sans`}
              >
                返回夜话
              </button>
            </div>

            <div data-testid="settings-layout" className="grid grid-cols-[150px_220px_minmax(0,1fr)] flex-1 min-h-0">
              <nav className={`border-r ${isAcademic ? 'border-slate/25' : 'border-[#1a1a1a]/10'} p-3 space-y-2 overflow-y-auto`}>
                {PRIMARY_SECTIONS.map(section => (
                  <button
                    key={section.id}
                    data-testid={`settings-primary-${section.id}`}
                    onClick={() => setPrimary(section.id)}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                      primary === section.id
                        ? (isAcademic ? 'bg-ember/10 border-ember/30 text-parchment' : 'bg-[#1a1a1a]/5 border-[#1a1a1a]/15 text-[#1a1a1a]')
                        : (isAcademic ? 'border-transparent text-parchment/60 hover:bg-slate/10 hover:text-parchment' : 'border-transparent text-[#777] hover:bg-[#1a1a1a]/5 hover:text-[#1a1a1a]')
                    }`}
                  >
                    <span className="block text-sm font-sans font-semibold">{section.label}</span>
                    <span className={`block mt-1 text-[11px] ${isAcademic ? 'text-parchment/40' : 'text-[#888]'}`}>{section.description}</span>
                  </button>
                ))}
              </nav>

              <nav className={`border-r ${isAcademic ? 'border-slate/25' : 'border-[#1a1a1a]/10'} p-3 overflow-y-auto`}>
                {primary === 'general' && (
                  <div className="space-y-1">
                    {GENERAL_SECTIONS.map(section => (
                      <button
                        key={section.id}
                        data-testid={`settings-general-${section.id}`}
                        onClick={() => setGeneralSection(section.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-sans border transition-colors ${
                          generalSection === section.id
                            ? (isAcademic ? 'bg-ember/10 text-parchment border-ember/30' : 'bg-[#1a1a1a]/5 text-[#1a1a1a] border-[#1a1a1a]/15')
                            : (isAcademic ? 'text-parchment/60 hover:bg-slate/10 hover:text-parchment border-transparent' : 'text-[#777] hover:bg-[#1a1a1a]/5 hover:text-[#1a1a1a] border-transparent')
                        }`}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>
                )}

                {primary === 'profile' && (
                  <div className="px-3 py-2">
                    <div className={`text-sm font-sans font-semibold ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>学习者卷宗</div>
                    <p className={`mt-2 text-xs leading-relaxed ${isAcademic ? 'text-parchment/45' : 'text-[#777]'}`}>
                      供所有 AI 生成参考
                    </p>
                  </div>
                )}

                {primary === 'extension' && (
                  <div className="space-y-1">
                    {EXTENSION_SECTIONS.map(section => (
                      <button
                        key={section.id}
                        data-testid={`settings-extension-${section.id}`}
                        onClick={() => setExtensionSection(section.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-sans border transition-colors ${
                          extensionSection === section.id
                            ? (isAcademic ? 'bg-ember/10 text-parchment border-ember/30' : 'bg-[#1a1a1a]/5 text-[#1a1a1a] border-[#1a1a1a]/15')
                            : (isAcademic ? 'text-parchment/60 hover:bg-slate/10 hover:text-parchment border-transparent' : 'text-[#777] hover:bg-[#1a1a1a]/5 hover:text-[#1a1a1a] border-transparent')
                        }`}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>
                )}
              </nav>

              <div className="min-w-0 min-h-0 flex flex-col">
                {error && (
                  <div data-testid="settings-error-display" className={`mx-6 mt-5 shrink-0 ${isAcademic ? 'bg-wine/10 border-wine/40' : 'bg-red-50 border-red-200'} border rounded-md px-4 py-3`}>
                    <p className={`text-sm ${isAcademic ? 'text-parchment/80' : 'text-[#1a1a1a]'}`}>{error}</p>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  {primary === 'general' && (
                    <GeneralSettings section={generalSection} isAcademic={isAcademic} showToast={showToast} onError={setError} />
                  )}
                  {primary === 'profile' && <ProfileSettings />}
                  {primary === 'extension' && <ExtensionSettings section={extensionSection} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
