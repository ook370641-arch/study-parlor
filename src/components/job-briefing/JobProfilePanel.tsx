import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { normalizeJobProfile, normalizeJobBriefingConfig } from '@/lib/job-briefing-defaults'

import type { JobProfile, JobBriefingConfig } from '@shared/index'

type Props = {
  open: boolean
  onClose: () => void
}

export function JobProfilePanel({ open, onClose }: Props) {

  const jobProfile = useStore(s => s.jobProfile)
  const jobConfig = useStore(s => s.jobBriefingConfig)
  const updateJobProfile = useStore(s => s.updateJobProfile)
  const setJobBriefingConfig = useStore(s => s.setJobBriefingConfig)
  const generateKeywords = useStore(s => s.generateJobBriefingKeywords)
  const discoverPages = useStore(s => s.discoverJobBriefingPages)
  const showToast = useStore(s => s.showToast)

  // Local edit state — sync from store on open; normalize defensively against stale/corrupted persisted data
  const [profile, setProfile] = useState<JobProfile>(() => normalizeJobProfile(jobProfile))
  const [config, setConfig] = useState<JobBriefingConfig>(() => normalizeJobBriefingConfig(jobConfig))
  const [newEventKeyword, setNewEventKeyword] = useState('')
  const [newJobKeyword, setNewJobKeyword] = useState('')
  const [newCompanyName, setNewCompanyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [discovering, setDiscovering] = useState(false)

  useEffect(() => {
    if (open) {
      setProfile(normalizeJobProfile(jobProfile))
      setConfig(normalizeJobBriefingConfig(jobConfig))
    }
  }, [open, jobProfile, jobConfig])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await updateJobProfile({ ...profile, updatedAt: new Date().toISOString() })
      await setJobBriefingConfig(config)
      showToast('求职档案已保存')
      onClose()
    } catch (err: any) {
      showToast('保存失败: ' + (err.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }, [profile, config, updateJobProfile, setJobBriefingConfig, showToast, onClose])

  const handleGenerateKeywords = useCallback(async () => {
    setGenerating(true)
    try {
      await updateJobProfile({ ...profile, updatedAt: new Date().toISOString() })
      await generateKeywords()
      const updatedConfig = useStore.getState().jobBriefingConfig
      setConfig(updatedConfig)
    } finally {
      setGenerating(false)
    }
  }, [profile, updateJobProfile, generateKeywords])

  const handleDiscoverPages = useCallback(async () => {
    setDiscovering(true)
    try {
      await discoverPages()
      const updatedConfig = useStore.getState().jobBriefingConfig
      setConfig(updatedConfig)
      showToast('官方招聘页链接已刷新')
    } catch (err: any) {
      showToast('刷新失败: ' + (err.message || '未知错误'))
    } finally {
      setDiscovering(false)
    }
  }, [discoverPages, showToast])

  const addEventKeyword = () => {
    if (!newEventKeyword.trim()) return
    setConfig(c => ({ ...c, eventSearchKeywords: [...c.eventSearchKeywords, newEventKeyword.trim()] }))
    setNewEventKeyword('')
  }

  const removeEventKeyword = (idx: number) => {
    setConfig(c => ({ ...c, eventSearchKeywords: c.eventSearchKeywords.filter((_, i) => i !== idx) }))
  }

  const addJobKeyword = () => {
    if (!newJobKeyword.trim()) return
    setConfig(c => ({ ...c, jobSearchKeywords: [...c.jobSearchKeywords, newJobKeyword.trim()] }))
    setNewJobKeyword('')
  }

  const removeJobKeyword = (idx: number) => {
    setConfig(c => ({ ...c, jobSearchKeywords: c.jobSearchKeywords.filter((_, i) => i !== idx) }))
  }

  const addCompany = () => {
    if (!newCompanyName.trim()) return
    const maxPriority = config.companies.reduce((m, c) => Math.max(m, c.priority), 0)
    setConfig(c => ({
      ...c,
      companies: [...c.companies, { name: newCompanyName.trim(), priority: maxPriority + 1, enabled: true, careerPageUrl: undefined }],
    }))
    setNewCompanyName('')
  }

  const toggleCompany = (idx: number) => {
    setConfig(c => ({
      ...c,
      companies: c.companies.map((co, i) => i === idx ? { ...co, enabled: !co.enabled } : co),
    }))
  }

  const updateCompanyUrl = (idx: number, url: string) => {
    setConfig(c => ({
      ...c,
      companies: c.companies.map((co, i) => i === idx ? { ...co, careerPageUrl: url || undefined } : co),
    }))
  }

  const removeCompany = (idx: number) => {
    setConfig(c => ({ ...c, companies: c.companies.filter((_, i) => i !== idx) }))
  }

  const undoAll = () => {
    setProfile(jobProfile)
    setConfig(jobConfig)
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop overlay */}
      <div
        data-testid="job-profile-panel-overlay"
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        data-testid="job-profile-panel"
        className="fixed top-0 right-0 h-full w-[420px] bg-[#2a1f1a] border-l border-[#3a3028] z-50 overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#2a1f1a] border-b border-[#3a3028] px-5 py-3.5 flex items-center justify-between z-10">
          <h3 className="text-[#e8a84c] font-semibold text-sm">⚙ 求职档案</h3>
          <button onClick={onClose} className="text-[#a09080] hover:text-[#e0d5c0] text-lg leading-none" aria-label="关闭">✕</button>
        </div>

        <div className="px-5 py-4 space-y-6">
          {/* Search toggles */}
          <section>
            <h4 className="text-[#706050] text-[0.65rem] uppercase tracking-wider mb-3 pb-1.5 border-b border-[#3a3028]">搜索维度</h4>
            <div className="flex gap-6">
              <Toggle label="秋招/校招" checked={config.searchFallRecruit} onChange={() => setConfig(c => ({ ...c, searchFallRecruit: !c.searchFallRecruit }))} />
              <Toggle label="实习/提前批" checked={config.searchInternship} onChange={() => setConfig(c => ({ ...c, searchInternship: !c.searchInternship }))} />
            </div>
          </section>

          {/* Profile fields */}
          <section>
            <h4 className="text-[#706050] text-[0.65rem] uppercase tracking-wider mb-3 pb-1.5 border-b border-[#3a3028]">个人档案</h4>
            <div className="space-y-3">
              <Field label="意向岗位（逗号分隔）">
                <Input data-testid="job-profile-target-roles" value={profile.targetRoles.join('，')} onChange={e => setProfile(p => ({ ...p, targetRoles: e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) }))} placeholder="如：AI产品经理, 模型产品经理" />
              </Field>
              <Field label="方向描述">
                <Input data-testid="job-profile-direction" value={profile.direction} onChange={e => setProfile(p => ({ ...p, direction: e.target.value }))} placeholder="一句话描述你的求职方向" />
              </Field>
              <Field label="技能清单（逗号分隔）">
                <Input data-testid="job-profile-skills" value={profile.skills.join('，')} onChange={e => setProfile(p => ({ ...p, skills: e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) }))} placeholder="如：RAG, Agent, 多模态" />
              </Field>
              <Field label="经历摘要">
                <textarea data-testid="job-profile-experience" value={profile.experience} onChange={e => setProfile(p => ({ ...p, experience: e.target.value }))} placeholder="简要描述相关实习/项目经历" rows={2} className="w-full px-2.5 py-2 rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] text-xs focus:border-[#d97757] outline-none resize-y" />
              </Field>
              <Field label="补充说明">
                <textarea data-testid="job-profile-notes" value={profile.additionalNotes} onChange={e => setProfile(p => ({ ...p, additionalNotes: e.target.value }))} placeholder="其他需要说明的信息" rows={2} className="w-full px-2.5 py-2 rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] text-xs focus:border-[#d97757] outline-none resize-y" />
              </Field>
            </div>
          </section>

          {/* Search keywords */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[#706050] text-[0.65rem] uppercase tracking-wider">搜索关键词</h4>
              <button data-testid="job-profile-generate-keywords" onClick={handleGenerateKeywords} disabled={generating} className="text-[0.65rem] px-2 py-0.5 rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0] hover:border-[#d97757] disabled:opacity-50">
                {generating ? '生成中...' : '🔄 重新生成'}
              </button>
            </div>
            <div className="text-[0.65rem] text-[#706050] mb-1.5">动态搜索</div>
            <TagList tags={config.eventSearchKeywords} onRemove={removeEventKeyword} />
            <div className="flex gap-1 mt-1.5">
              <input value={newEventKeyword} onChange={e => setNewEventKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && addEventKeyword()} placeholder="添加关键词..." className="flex-1 px-2 py-1 text-[0.7rem] rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] focus:border-[#d97757] outline-none" />
              <button onClick={addEventKeyword} className="px-2 py-0.5 text-[0.65rem] rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0]">+</button>
            </div>
            <div className="text-[0.65rem] text-[#706050] mt-3 mb-1.5">岗位搜索</div>
            <TagList tags={config.jobSearchKeywords} onRemove={removeJobKeyword} />
            <div className="flex gap-1 mt-1.5">
              <input value={newJobKeyword} onChange={e => setNewJobKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && addJobKeyword()} placeholder="添加关键词..." className="flex-1 px-2 py-1 text-[0.7rem] rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] focus:border-[#d97757] outline-none" />
              <button onClick={addJobKeyword} className="px-2 py-0.5 text-[0.65rem] rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0]">+</button>
            </div>
          </section>

          {/* Company list */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[#706050] text-[0.65rem] uppercase tracking-wider">关注公司</h4>
              <button data-testid="job-profile-add-company" onClick={addCompany} className="text-[0.65rem] px-2 py-0.5 rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0]">+ 添加</button>
            </div>
            {config.companies.sort((a, b) => a.priority - b.priority).map((c, i) => {
              const origIdx = config.companies.indexOf(c)
              return (
                <div key={c.name + i} className="flex items-center gap-2 py-1.5 border-b border-[#3a3028]/50 text-[0.75rem]">
                  <input type="checkbox" checked={c.enabled} onChange={() => toggleCompany(origIdx)} className="accent-[#d97757]" />
                  <span className="w-6 text-center text-[#706050] text-[0.65rem] font-mono">{c.priority}</span>
                  <span className="flex-1 text-[#e0d5c0]">{c.name}</span>
                  {c.careerPageUrl ? (
                    <span className="text-[0.65rem] text-[#7fa8d9] max-w-[140px] truncate" title={c.careerPageUrl}>{c.careerPageUrl.replace(/^https?:\/\//, '')}</span>
                  ) : (
                    <span className="text-[0.65rem] text-[#706050]">未发现招聘页</span>
                  )}
                  <button onClick={() => { const url = prompt('编辑招聘页URL:', c.careerPageUrl ?? ''); if (url !== null) updateCompanyUrl(origIdx, url) }} className="text-[0.6rem] px-1 text-[#a09080] hover:text-[#e0d5c0]">✏</button>
                  <button onClick={() => removeCompany(origIdx)} className="text-[0.6rem] px-1 text-[#a09080] hover:text-[#d95b5b]">×</button>
                </div>
              )
            })}
            <div className="flex gap-1 mt-2">
              <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCompany()} placeholder="新公司名..." className="flex-1 px-2 py-1 text-[0.7rem] rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] focus:border-[#d97757] outline-none" />
            </div>
            <button data-testid="job-profile-discover-pages" onClick={handleDiscoverPages} disabled={discovering} className="mt-2 text-[0.65rem] px-2 py-0.5 rounded border border-[#3a3028] text-[#a09080] hover:text-[#e0d5c0] disabled:opacity-50">
              {discovering ? '刷新中...' : '🔄 刷新所有官方招聘页链接'}
            </button>
          </section>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button data-testid="job-profile-save" onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 rounded-md bg-[#d97757] text-white text-sm hover:bg-[#c86845] disabled:opacity-50">
              {saving ? '保存中...' : '保存档案'}
            </button>
            <button onClick={undoAll} className="px-4 py-2 rounded-md border border-[#3a3028] text-[#a09080] text-sm hover:text-[#e0d5c0]">取消</button>
          </div>
        </div>
      </div>
    </>
  )
}

// Helper sub-components

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-[#a09080]">
      <div className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-[#d97757]' : 'bg-[#3a3028]'}`} onClick={onChange}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      {label}
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[0.7rem] text-[#a09080] mb-1">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} {...rest}
      className="w-full px-2.5 py-2 rounded border border-[#3a3028] bg-[#1a1410] text-[#e0d5c0] text-xs focus:border-[#d97757] outline-none"
    />
  )
}

function TagList({ tags, onRemove }: { tags: string[]; onRemove: (idx: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.7rem] bg-[#d97757]/10 text-[#d97757] border border-[#d97757]/20">
          {t}
          <button onClick={() => onRemove(i)} className="text-[#d97757] hover:text-[#d95b5b] text-[0.6rem] leading-none">×</button>
        </span>
      ))}
    </div>
  )
}
