import { useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import { GeneralSettings } from '@/components/settings/GeneralSettings'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
import { ExtensionSettings } from '@/components/settings/ExtensionSettings'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { WRITING_UI_STYLES } from '@/lib/briefing-font-size'

type Primary = 'general' | 'profile' | 'extension'
type GeneralSection = 'ai' | 'appearance' | 'library'
type ExtensionSection = 'terminology' | 'paintings' | 'agent'

const PRIMARY_SECTIONS: { id: Primary; label: string }[] = [
  { id: 'general', label: '常规' },
  { id: 'profile', label: '卷宗' },
  { id: 'extension', label: '扩展' },
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
  const showToast = useStore(s => s.showToast)
  const theme = useStore((s) => s.briefingTheme)
  const writingUIFontSize = useStore((s) => s.writingUIFontSize)
  const isAcademic = theme !== 'newspaper'
  const uiSize = WRITING_UI_STYLES[writingUIFontSize]
  const [primary, setPrimary] = useState<Primary>('general')
  const [generalSection, setGeneralSection] = useState<GeneralSection>('ai')
  const [extensionSection, setExtensionSection] = useState<ExtensionSection>('terminology')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div
      data-testid="settings-page"
      className={`settings-ui-font relative h-full flex overflow-hidden ${isAcademic ? 'gap-2 p-2' : 'bg-[#f5f2ed]'}`}
      style={{ fontSize: uiSize, '--settings-ui-scale': Number.parseInt(uiSize, 10) / 12 } as React.CSSProperties}
    >
      <SurfaceBackground surface="home" />
      <BriefingSourceSidebar
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onSourceSelect={() => void goto('briefing')}
      />

      <div data-testid="settings-layout" className="relative z-[5] flex-1 flex min-w-0 min-h-0">
        <BriefingListColumn collapsed={false} theme={theme} width={64} title="设置">
          <nav className="p-3 space-y-4">
            {PRIMARY_SECTIONS.map(section => (
              <div key={section.id} className="space-y-1">
                <button
                  data-testid={`settings-primary-${section.id}`}
                  onClick={() => setPrimary(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-sans font-semibold border transition-colors ${
                    primary === section.id
                      ? (isAcademic ? 'bg-ember/10 border-ember/30 text-parchment' : 'bg-[#1a1a1a]/5 border-[#1a1a1a]/15 text-[#1a1a1a]')
                      : (isAcademic ? 'border-transparent text-parchment/60 hover:bg-slate/10 hover:text-parchment' : 'border-transparent text-[#777] hover:bg-[#1a1a1a]/5 hover:text-[#1a1a1a]')
                  }`}
                >
                  {section.label}
                </button>

                {section.id === 'general' && GENERAL_SECTIONS.map(general => (
                  <button
                    key={general.id}
                    data-testid={`settings-general-${general.id}`}
                    onClick={() => {
                      setPrimary('general')
                      setGeneralSection(general.id)
                    }}
                    className={`w-full text-left pl-6 pr-3 py-2 rounded-lg text-sm font-sans border transition-colors ${
                      primary === 'general' && generalSection === general.id
                        ? (isAcademic ? 'bg-ember/10 text-parchment border-ember/30' : 'bg-[#1a1a1a]/5 text-[#1a1a1a] border-[#1a1a1a]/15')
                        : (isAcademic ? 'text-parchment/60 hover:bg-slate/10 hover:text-parchment border-transparent' : 'text-[#777] hover:bg-[#1a1a1a]/5 hover:text-[#1a1a1a] border-transparent')
                    }`}
                  >
                    {general.label}
                  </button>
                ))}

                {section.id === 'extension' && EXTENSION_SECTIONS.map(extension => (
                  <button
                    key={extension.id}
                    data-testid={`settings-extension-${extension.id}`}
                    onClick={() => {
                      setPrimary('extension')
                      setExtensionSection(extension.id)
                    }}
                    className={`w-full text-left pl-6 pr-3 py-2 rounded-lg text-sm font-sans border transition-colors ${
                      primary === 'extension' && extensionSection === extension.id
                        ? (isAcademic ? 'bg-ember/10 text-parchment border-ember/30' : 'bg-[#1a1a1a]/5 text-[#1a1a1a] border-[#1a1a1a]/15')
                        : (isAcademic ? 'text-parchment/60 hover:bg-slate/10 hover:text-parchment border-transparent' : 'text-[#777] hover:bg-[#1a1a1a]/5 hover:text-[#1a1a1a] border-transparent')
                    }`}
                  >
                    {extension.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </BriefingListColumn>

        <main className={`flex-1 min-w-0 min-h-0 flex flex-col ${isAcademic ? 'bg-ink/72 border-parchment/15' : 'bg-white border-[#1a1a1a]/10'} backdrop-blur-md border rounded-xl overflow-hidden`}>
          <div className={`flex justify-between items-center px-6 pt-5 pb-3 border-b ${isAcademic ? 'border-slate/25' : 'border-[#1a1a1a]/10'} shrink-0`}>
            <h2 className="text-2xl font-serif font-semibold">设置 · 仪器调校</h2>
            <StudyControlsGroup surface="home" uiFontControls />
          </div>

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
        </main>
      </div>
    </div>
  )
}
