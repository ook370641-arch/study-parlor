import { useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import { getTemperatureLabel } from '@/lib/temperature-label'
import { getDifficultyLabel } from '@/lib/difficulty-label'
import { useTerminology } from '@/lib/terminology'

export function Profile() {
  const profile = useStore(s => s.profile)
  const lastUsed = useStore(s => s.lastUsed)
  const patchProfile = useStore(s => s.patchProfile)
  const patchLastUsed = useStore(s => s.patchLastUsed)
  const goto = useStore(s => s.goto)
  const showToast = useStore(s => s.showToast)
  const t = useTerminology()
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.name)
  const [text, setText] = useState(profile.profile_text)
  const [topics, setTopics] = useState(profile.preferred_topics.join('、'))
  const [difficulty, setDifficulty] = useState(lastUsed.difficulty)
  const [temperature, setTemperature] = useState(lastUsed.temperature)

  const onSave = async () => {
    await patchProfile({
      name: name.trim() || profile.name,
      profile_text: text.trim(),
      preferred_topics: topics.split(/[、,,]/).map(s => s.trim()).filter(Boolean)
    })
    await patchLastUsed({ difficulty, temperature })
    setEditing(false)
    showToast('已保存')
  }

  if (!editing) {
    return (
      <div data-testid="profile-page" className="fixed inset-0">
        <SurfaceBackground surface="home" />
        <StudyControlsGroup surface="home" className="absolute top-4 right-4 z-10" />

        <div className="absolute top-10 left-6 right-6 z-10">
          <div className="max-w-3xl mx-auto">
            <div className={`${isAcademic ? 'bg-ink/72' : 'bg-white'} backdrop-blur-md border ${isAcademic ? 'border-slate/30' : 'border-[#1a1a1a]/10'} rounded-xl p-6`}>
            <div className={`flex justify-between items-center pb-3 mb-4 border-b ${isAcademic ? 'border-slate/25' : 'border-[#1a1a1a]/8'}`}>
              <h2 className="text-2xl font-serif font-semibold">你</h2>
              <button
                data-testid="profile-exit-button"
                onClick={() => goto('home')}
                className={`${isAcademic ? 'text-parchment/70 hover:text-parchment' : 'text-[#555] hover:text-[#1a1a1a]'} text-sm bg-transparent border-none cursor-pointer font-sans`}
              >
                退出
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-7 gap-y-3.5">
              <div>
                <div className={`text-[10px] ${isAcademic ? 'text-parchment/50' : 'text-[#888]'} font-sans uppercase tracking-wider mb-1`}>{t.profileNameLabel}</div>
                <div data-testid="profile-name-display" className={`text-xl font-semibold ${isAcademic ? 'text-ember' : 'text-[#8a3a3a]'}`}>{profile.name}</div>
              </div>
              <div>
                <div className={`text-[10px] ${isAcademic ? 'text-parchment/50' : 'text-[#888]'} font-sans uppercase tracking-wider mb-1`}>{t.profileFieldLabel}</div>
                <div data-testid="profile-topics-display" className={`text-sm ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>{profile.preferred_topics.join(' · ') || '未填'}</div>
              </div>
              <div className="col-span-2">
                <div className={`text-[10px] ${isAcademic ? 'text-parchment/50' : 'text-[#888]'} font-sans uppercase tracking-wider mb-1`}>{t.profileTextLabel}</div>
                <div data-testid="profile-text-display" className={`text-sm ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'} leading-relaxed`}>{profile.profile_text || '未填'}</div>
              </div>
              <div>
                <div className={`text-[10px] ${isAcademic ? 'text-parchment/50' : 'text-[#888]'} font-sans uppercase tracking-wider mb-1`}>{t.difficultyLabel}</div>
                <div data-testid="profile-difficulty-display" className={`text-sm ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>
                  {getDifficultyLabel(lastUsed.difficulty, t)}
                </div>
              </div>
              <div>
                <div className={`text-[10px] ${isAcademic ? 'text-parchment/50' : 'text-[#888]'} font-sans uppercase tracking-wider mb-1`}>{t.temperatureLabel}</div>
                <div data-testid="profile-temperature-display" className={`text-sm ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>{getTemperatureLabel(lastUsed.temperature, t)}</div>
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-5">
            <Button data-testid="profile-edit-button" onClick={() => setEditing(true)}>改写</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

  return (
    <div data-testid="profile-page" className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <StudyControlsGroup surface="home" className="absolute top-4 right-4 z-10" />

      <div className="absolute top-10 left-6 right-6 bottom-5 z-10">
        <div className="max-w-3xl mx-auto h-full flex flex-col">
          <div className={`${isAcademic ? 'bg-ink/78' : 'bg-white'} backdrop-blur-md border ${isAcademic ? 'border-slate/30' : 'border-[#1a1a1a]/10'} rounded-xl p-5 flex flex-col gap-3 overflow-y-auto flex-1`}>
          <h2 className={`text-xl font-serif font-semibold pb-2 mb-1 border-b ${isAcademic ? 'border-slate/20' : 'border-[#1a1a1a]/8'}`}>改写</h2>

          <div>
            <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>{t.profileNameLabel}</div>
            <Input data-testid="profile-name-input" value={name} onChange={e => setName(e.target.value)} className="w-full" />
          </div>

          <div>
            <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>{t.profileTextLabel}</div>
            <textarea
              data-testid="profile-text-input"
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
              className={`w-full ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment' : 'bg-white border-[#1a1a1a]/12 text-[#1a1a1a]'} rounded-md p-3 focus:outline-none focus:border-ember/60 font-serif resize-y min-h-[80px]`}
            />
          </div>

          <div>
            <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>{t.profileFieldLabel}</div>
            <Input data-testid="profile-topics-input" value={topics} onChange={e => setTopics(e.target.value)} className="w-full" />
          </div>

          <div>
            <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>{t.difficultyLabel}</div>
            <div className="flex gap-2 flex-wrap">
              {(['high', 'mid', 'low'] as const).map(d => (
                <button
                  key={d}
                  data-testid={`profile-difficulty-${d}`}
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-1.5 rounded text-sm font-sans border cursor-pointer transition-colors ${
                    difficulty === d
                      ? (isAcademic ? 'bg-ember text-ink border-ember' : 'bg-[#1a1a1a] text-white border-[#1a1a1a]')
                      : `bg-transparent ${isAcademic ? 'text-parchment/70 border-slate/40' : 'text-[#555] border-[#1a1a1a]/12'} hover:border-slate/60`
                  }`}
                >
                  {getDifficultyLabel(d, t)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>{t.temperatureLabel}</div>
            <div className="flex gap-2 flex-wrap">
              {[0.3, 0.7, 1.0].map(temp => (
                <button
                  key={temp}
                  data-testid={`profile-temperature-${temp.toFixed(1)}`}
                  onClick={() => setTemperature(temp)}
                  className={`px-4 py-1.5 rounded text-sm font-sans border cursor-pointer transition-colors ${
                    temperature === temp
                      ? (isAcademic ? 'bg-ember text-ink border-ember' : 'bg-[#1a1a1a] text-white border-[#1a1a1a]')
                      : `bg-transparent ${isAcademic ? 'text-parchment/70 border-slate/40' : 'text-[#555] border-[#1a1a1a]/12'} hover:border-slate/60`
                  }`}
                >
                  {getTemperatureLabel(temp, t)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2 mt-auto">
            <Button data-testid="profile-save-button" onClick={onSave}>落印</Button>
            <Button data-testid="profile-cancel-button" variant="ghost" onClick={() => setEditing(false)}>作废</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
)
}
