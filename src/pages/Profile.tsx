import { useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { getTemperatureLabel } from '@/lib/temperature-label'
import { getDifficultyLabel } from '@/lib/difficulty-label'

export function Profile() {
  const profile = useStore(s => s.profile)
  const lastUsed = useStore(s => s.lastUsed)
  const patchProfile = useStore(s => s.patchProfile)
  const patchLastUsed = useStore(s => s.patchLastUsed)
  const goto = useStore(s => s.goto)
  const showToast = useStore(s => s.showToast)

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
      <div className="fixed inset-0">
        <SurfaceBackground surface="home" />
        <SwapPaintingButton surface="home" className="absolute top-4 right-4 z-10" />

        <div className="absolute top-10 left-6 right-6 z-10">
          <div className="max-w-3xl mx-auto">
            <div className="bg-ink/72 backdrop-blur-md border border-slate/30 rounded-xl p-6">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate/25">
              <h2 className="text-2xl font-serif font-semibold">你</h2>
              <button
                onClick={() => goto('home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                退出
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-7 gap-y-3.5">
              <div>
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">代号</div>
                <div className="text-xl font-semibold text-ember">{profile.name}</div>
              </div>
              <div>
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">领域</div>
                <div className="text-sm text-parchment">{profile.preferred_topics.join(' · ') || '未填'}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">侧写</div>
                <div className="text-sm text-parchment leading-relaxed">{profile.profile_text || '未填'}</div>
              </div>
              <div>
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">审讯强度</div>
                <div className="text-sm text-parchment">
                  {getDifficultyLabel(lastUsed.difficulty)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-parchment/50 font-sans uppercase tracking-wider mb-1">腔调</div>
                <div className="text-sm text-parchment">{getTemperatureLabel(lastUsed.temperature)}</div>
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-5">
            <Button onClick={() => setEditing(true)}>改写</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

  return (
    <div className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-4 z-10" />

      <div className="absolute top-10 left-6 right-6 bottom-5 z-10">
        <div className="max-w-3xl mx-auto h-full flex flex-col">
          <div className="bg-ink/78 backdrop-blur-md border border-slate/30 rounded-xl p-5 flex flex-col gap-3 overflow-y-auto flex-1">
          <h2 className="text-xl font-serif font-semibold pb-2 mb-1 border-b border-slate/20">改写</h2>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">代号</div>
            <Input value={name} onChange={e => setName(e.target.value)} className="w-full" />
          </div>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">你是谁</div>
            <textarea
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full bg-ink/50 border border-slate/40 rounded-md p-3 text-parchment focus:outline-none focus:border-ember/60 font-serif resize-y min-h-[80px]"
            />
          </div>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">领域</div>
            <Input value={topics} onChange={e => setTopics(e.target.value)} className="w-full" />
          </div>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">审讯强度</div>
            <div className="flex gap-2 flex-wrap">
              {(['high', 'mid', 'low'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-1.5 rounded text-sm font-sans border cursor-pointer transition-colors ${
                    difficulty === d
                      ? 'bg-ember text-ink border-ember'
                      : 'bg-transparent text-parchment/70 border-slate/40 hover:border-slate/60'
                  }`}
                >
                  {getDifficultyLabel(d)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-parchment/60 font-sans mb-1">腔调</div>
            <div className="flex gap-2 flex-wrap">
              {[0.3, 0.7, 1.0].map(t => (
                <button
                  key={t}
                  onClick={() => setTemperature(t)}
                  className={`px-4 py-1.5 rounded text-sm font-sans border cursor-pointer transition-colors ${
                    temperature === t
                      ? 'bg-ember text-ink border-ember'
                      : 'bg-transparent text-parchment/70 border-slate/40 hover:border-slate/60'
                  }`}
                >
                  {getTemperatureLabel(t)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2 mt-auto">
            <Button onClick={onSave}>落印</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>作废</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
)
}
