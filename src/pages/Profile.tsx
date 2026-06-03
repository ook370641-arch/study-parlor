import { useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { getTemperatureLabel } from '@/lib/temperature-label'

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
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-serif">你</h2>
          <Button variant="ghost" onClick={() => goto('home')}>退出</Button>
        </div>
        <div className="panel p-6 space-y-4">
          <div><span className="field-label">代号:</span>{profile.name}</div>
          <div><span className="field-label">侧写:</span>{profile.profile_text || '未填'}</div>
          <div><span className="field-label">领域:</span>{profile.preferred_topics.join(' · ') || '未填'}</div>
          <div><span className="field-label">审讯强度:</span>{lastUsed.difficulty === 'high' ? '追至墙角' : lastUsed.difficulty === 'mid' ? '互相试探' : '先暖暖场'}</div>
          <div><span className="field-label">腔调:</span>{getTemperatureLabel(lastUsed.temperature)}</div>
        </div>
        <Button onClick={() => setEditing(true)}>改写</Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-4">
      <h2 className="text-2xl font-serif">改写</h2>

      <div>
        <div className="field-label mb-1">代号</div>
        <Input value={name} onChange={e => setName(e.target.value)} className="w-full" />
      </div>

      <div>
        <div className="field-label mb-1">你是谁</div>
        <textarea rows={4}
          value={text} onChange={e => setText(e.target.value)}
          className="w-full bg-ink/40 border border-slate/40 rounded p-3
                     text-parchment focus:outline-none focus:border-ember font-serif" />
      </div>

      <div>
        <div className="field-label mb-1">领域</div>
        <Input value={topics} onChange={e => setTopics(e.target.value)} className="w-full" />
      </div>

      <div>
        <div className="field-label mb-1">审讯强度</div>
        <div className="flex gap-2">
          {(['high', 'mid', 'low'] as const).map(d => (
            <button key={d}
              onClick={() => setDifficulty(d)}
              className={`px-4 py-1.5 rounded font-sans text-sm border
                ${difficulty === d ? 'bg-ember text-ink border-ember' : 'border-slate/40'}`}>
              {d === 'high' ? '追至墙角' : d === 'mid' ? '互相试探' : '先暖暖场'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="field-label mb-1">腔调</div>
        <div className="flex gap-2">
          {[0.3, 0.7, 1.0].map(t => (
            <button key={t}
              onClick={() => setTemperature(t)}
              className={`px-4 py-1.5 rounded font-sans text-sm border
                ${temperature === t ? 'bg-ember text-ink border-ember' : 'border-slate/40'}`}>
              {getTemperatureLabel(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button onClick={onSave}>落印</Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>作废</Button>
      </div>
    </div>
  )
}
