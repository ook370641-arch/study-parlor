import { useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { Button } from '@/components/Button'
import { llmConfigLabel } from '@/lib/llm-configs'
import type { LlmConfig } from '@shared/index'

type Fields = { apiKey: string; baseUrl: string; model: string }
type VerifyStatus =
  | { kind: 'loading'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

interface Props {
  isAcademic: boolean
  showToast: (msg: string) => void
  onError: (msg: string) => void
}

export function LlmConfigCard({ isAcademic, showToast, onError }: Props) {
  const [configs, setConfigs] = useState<LlmConfig[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Fields>({ apiKey: '', baseUrl: '', model: '' })
  const [draft, setDraft] = useState<Fields | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelListStatus, setModelListStatus] = useState<VerifyStatus | null>(null)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)

  const toFields = (c: LlmConfig): Fields => ({ apiKey: c.apiKey, baseUrl: c.baseUrl, model: c.model })

  useEffect(() => {
    let mounted = true
    ipc.llmConfigList().then(({ configs, activeId }) => {
      if (!mounted) return
      setConfigs(configs)
      setActiveId(activeId)
      const cur = configs.find(c => c.id === activeId) ?? configs[0]
      if (cur) { setEditingId(cur.id); setForm(toFields(cur)); setAvailableModels(cur.models ?? []) }
    }).catch(err => onError(err?.message || '读取 LLM 配置失败'))
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const editingConfig = configs.find(c => c.id === editingId) ?? null
  const isEditingActive = editingId !== null && editingId === activeId
  const fields = draft ?? form
  const setFields = (f: Fields) => (draft ? setDraft(f) : setForm(f))

  const selectChip = (id: string) => {
    const c = configs.find(x => x.id === id)
    if (!c) return
    setEditingId(id)
    setForm(toFields(c))
    setVerifyStatus(null)
    setAvailableModels(c.models ?? [])
    setModelListStatus(null)
    setModelDropdownOpen(false)
  }

  const startDraft = () => {
    setDraft({ apiKey: '', baseUrl: '', model: '' })
    setSummaryOpen(false)
    setVerifyStatus(null)
    setAvailableModels([])
    setModelListStatus(null)
    setModelDropdownOpen(false)
  }

  const cancelDraft = () => {
    setDraft(null)
    setVerifyStatus(null)
    setAvailableModels(editingConfig?.models ?? [])
    setModelListStatus(null)
    setModelDropdownOpen(false)
    if (editingConfig) setForm(toFields(editingConfig)) // 还原查看中的配置
  }

  const reload = async (selectId?: string) => {
    const { configs: next, activeId: act } = await ipc.llmConfigList()
    setConfigs(next)
    setActiveId(act)
    const target = next.find(c => c.id === (selectId ?? editingId)) ?? next.find(c => c.id === act) ?? next[0]
    if (target) { setEditingId(target.id); setForm(toFields(target)); setAvailableModels(target.models ?? []) }
  }

  const saveDraft = async () => {
    if (!draft) return
    try {
      const r = await ipc.llmConfigSave(null, { ...draft, models: availableModels })
      if (!r.ok) { onError('保存新配置失败'); return }
      setDraft(null)
      await reload(r.id)
      showToast('新配置已保存')
    } catch (err: any) {
      onError(err?.message || '保存新配置失败')
    }
  }

  const saveEditing = async () => {
    if (!editingId) return
    try {
      const r = await ipc.llmConfigSave(editingId, { ...form, models: availableModels })
      if (!r.ok) { onError('保存配置失败'); return }
      await reload()
      showToast(isEditingActive ? '配置已保存，立即生效' : '配置已保存')
    } catch (err: any) {
      onError(err?.message || '保存配置失败')
    }
  }

  const activate = async () => {
    if (!editingId) return
    try {
      const r = await ipc.llmConfigSetActive(editingId)
      if (!r.ok) { onError('切换失败'); return }
      setActiveId(editingId)
      const c = configs.find(x => x.id === editingId)
      showToast(`已切换到 ${c ? llmConfigLabel(c, configs) : '新配置'}`)
    } catch (err: any) {
      onError(err?.message || '切换失败')
    }
  }

  const verify = async () => {
    setVerifyStatus({ kind: 'loading', message: '验证中...' })
    try {
      const r = await ipc.setupProbeKey({ apiKey: fields.apiKey.trim(), baseUrl: fields.baseUrl.trim(), model: fields.model.trim() })
      setVerifyStatus(r.ok ? { kind: 'success', message: '连接正常' } : { kind: 'error', message: r.reason || '验证失败' })
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('401') || msg.includes('UNAUTHORIZED')) {
        setVerifyStatus({ kind: 'error', message: 'API Key 无效' })
      } else if (msg.includes('TIMEOUT') || msg.includes('timeout')) {
        setVerifyStatus({ kind: 'error', message: '网络超时' })
      } else {
        setVerifyStatus({ kind: 'error', message: '验证失败，请检查配置' })
      }
    }
  }

  const refreshModels = async () => {
    setModelListStatus({ kind: 'loading', message: '正在获取模型列表...' })
    try {
      const result = await ipc.llmConfigListModels({ apiKey: fields.apiKey.trim(), baseUrl: fields.baseUrl.trim() })
      if (result.ok) {
        setAvailableModels(result.models)
        if (!draft && editingId) {
          const saved = await ipc.llmConfigSaveModels(editingId, result.models)
          if (!saved.ok) { setModelListStatus({ kind: 'error', message: '模型列表保存失败' }); return }
          setConfigs(current => current.map(c => c.id === editingId ? { ...c, models: result.models } : c))
        }
        setModelListStatus({ kind: 'success', message: result.models.length > 0 ? `已更新，共 ${result.models.length} 个模型` : '接口未返回可选模型' })
      } else {
        setModelListStatus({ kind: 'error', message: result.reason || '获取模型列表失败' })
      }
    } catch (err: any) {
      setModelListStatus({ kind: 'error', message: err?.message || '获取模型列表失败' })
    }
  }

  // 样式基元（与 Settings 现有卡片一致）
  const labelCls = `text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`
  const inputCls = `w-full ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`
  const ghostBtnCls = `px-3 py-2 border ${isAcademic ? 'border-slate/40 text-parchment/80 hover:text-parchment' : 'border-[#1a1a1a]/15 text-[#555] hover:text-[#1a1a1a]'} rounded-md text-sm transition-colors shrink-0`

  const fieldsBlock = (f: Fields, disabled: boolean) => (
    <div className="space-y-4">
      <div>
        <div className={labelCls}>API Key</div>
        <div className="flex gap-2">
          <input
            data-testid="settings-api-key-input"
            type={showKey ? 'text' : 'password'}
            value={f.apiKey}
            disabled={disabled}
            onChange={e => { setFields({ ...f, apiKey: e.target.value }); setAvailableModels([]); setModelListStatus(null) }}
            placeholder="sk-..."
            className={`flex-1 ${inputCls}`}
          />
          <button data-testid="settings-api-key-toggle" type="button" onClick={() => setShowKey(!showKey)} className={ghostBtnCls}>
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>
      </div>
      <div>
        <div className={labelCls}>Base URL</div>
        <input data-testid="settings-base-url-input" type="text" value={f.baseUrl} disabled={disabled}
          onChange={e => { setFields({ ...f, baseUrl: e.target.value }); setAvailableModels([]); setModelListStatus(null) }} className={inputCls} />
      </div>
      <div>
        <div className={labelCls}>Model</div>
        <div className="flex gap-2">
          <div className="relative flex-1" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setModelDropdownOpen(false) }}>
            <input
              data-testid="settings-model-input"
              type="text"
              role="combobox"
              aria-expanded={modelDropdownOpen}
              aria-controls="settings-model-options"
              value={f.model}
              disabled={disabled}
              onClick={() => { if (availableModels.length > 0) setModelDropdownOpen(true) }}
              onChange={e => { setFields({ ...f, model: e.target.value }); setModelDropdownOpen(availableModels.length > 0) }}
              onKeyDown={e => { if (e.key === 'Escape') setModelDropdownOpen(false) }}
              className={`w-full ${availableModels.length > 0 ? 'pr-8' : ''} ${inputCls}`}
            />
            {availableModels.length > 0 && (
              <button
                data-testid="settings-model-dropdown-toggle"
                type="button"
                aria-label="展开模型列表"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setModelDropdownOpen(open => !open)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 ${isAcademic ? 'text-parchment/50' : 'text-[#777]'}`}
              >
                {modelDropdownOpen ? '▴' : '▾'}
              </button>
            )}
            {modelDropdownOpen && availableModels.length > 0 && (
              <div id="settings-model-options" data-testid="settings-model-options" className={`absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-md border shadow-lg ${isAcademic ? 'border-slate/30 bg-ink' : 'border-[#1a1a1a]/10 bg-white'}`}>
                {availableModels.map(model => (
                  <button
                    key={model}
                    data-testid="settings-model-option"
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setFields({ ...f, model }); setModelDropdownOpen(false) }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                      f.model === model
                        ? (isAcademic ? 'bg-ember/15 text-ember' : 'bg-[#1a1a1a]/5 text-[#1a1a1a]')
                        : (isAcademic ? 'text-parchment/80 hover:bg-parchment/5' : 'text-[#555] hover:bg-[#1a1a1a]/5')
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button data-testid="settings-model-refresh" type="button" onClick={refreshModels}
            disabled={!f.apiKey.trim() || !f.baseUrl.trim() || modelListStatus?.kind === 'loading'} className={ghostBtnCls}>
            {modelListStatus?.kind === 'loading' ? '探活中...' : '探活并更新'}
          </button>
        </div>
        {modelListStatus && (
          <div data-testid="settings-model-list-status" className={`mt-1 text-xs ${
            modelListStatus.kind === 'error' ? 'text-wine' :
            modelListStatus.kind === 'success' ? (isAcademic ? 'text-ember' : 'text-green-700') :
            (isAcademic ? 'text-parchment/40' : 'text-[#888]')
          }`}>{modelListStatus.message}</div>
        )}
      </div>
    </div>
  )

  return (
    <div className={`${isAcademic ? 'bg-parchment/5 border-slate/20' : 'bg-white border-[#1a1a1a]/10'} border rounded-lg p-4 mb-4`}>
      <h3 className={`${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'} font-semibold mb-4`}>AI 服务</h3>

      {/* 切换器：≥2 配置且不在草稿态时出现 */}
      {configs.length > 1 && !draft && (
        <div className="mb-4">
          <div className={labelCls}>配置</div>
          <div className="flex flex-wrap gap-2">
            {configs.map(c => {
              const active = c.id === activeId
              const selected = c.id === editingId
              return (
                <button
                  key={c.id}
                  data-testid="settings-llm-config-chip"
                  data-id={c.id}
                  type="button"
                  onClick={() => selectChip(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    selected
                      ? (isAcademic ? 'border-ember/60 text-ember' : 'border-[#1a1a1a] text-[#1a1a1a]')
                      : (isAcademic ? 'border-slate/40 text-parchment/70 hover:text-parchment' : 'border-[#1a1a1a]/15 text-[#555] hover:text-[#1a1a1a]')
                  }`}
                >
                  {llmConfigLabel(c, configs)}
                  {active && <span data-testid="settings-llm-active-badge" className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${isAcademic ? 'bg-ember text-ink' : 'bg-[#1a1a1a] text-white'}`}>使用中</span>}
                  {!c.apiKey && <span className="ml-1.5 text-[10px] text-wine">未配置</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 草稿态：原配置摘要钉在上方（数据可见未丢），草稿区独立视觉 */}
      {draft && editingConfig && (
        <div className={`mb-3 rounded-md border ${isAcademic ? 'border-slate/25' : 'border-[#1a1a1a]/10'}`}>
          <button
            data-testid="settings-llm-current-summary"
            type="button"
            onClick={() => setSummaryOpen(!summaryOpen)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${isAcademic ? 'text-parchment/70' : 'text-[#555]'}`}
          >
            <span>{summaryOpen ? '▾' : '▸'}</span>
            <span>当前配置：{llmConfigLabel(editingConfig, configs)}</span>
            {editingConfig.id === activeId && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${isAcademic ? 'bg-ember text-ink' : 'bg-[#1a1a1a] text-white'}`}>使用中</span>
            )}
          </button>
          {summaryOpen && (
            <div className={`px-3 pb-2 text-xs ${isAcademic ? 'text-parchment/50' : 'text-[#777]'}`}>
              <div>Base URL：{editingConfig.baseUrl || '（空）'}</div>
              <div>API Key：{editingConfig.apiKey ? '••••••••' + editingConfig.apiKey.slice(-4) : '（空）'}</div>
            </div>
          )}
        </div>
      )}

      {draft ? (
        <div data-testid="settings-llm-draft" className={`rounded-md border border-dashed ${isAcademic ? 'border-ember/50' : 'border-[#b08060]'} p-3`}>
          <div className={`text-xs mb-3 ${isAcademic ? 'text-ember' : 'text-[#8a5a30]'}`}>✏️ 新配置（未保存）</div>
          {fieldsBlock(draft, false)}
          <div className="flex items-center gap-3 mt-4">
            <Button data-testid="settings-verify-button" onClick={verify} disabled={!fields.apiKey.trim()}>验证连接</Button>
            <Button data-testid="settings-llm-draft-save" onClick={saveDraft}>保存为新配置</Button>
            <Button data-testid="settings-llm-draft-cancel" variant="ghost" onClick={cancelDraft}>取消</Button>
            {verifyStatus && <VerifyHint status={verifyStatus} isAcademic={isAcademic} />}
          </div>
        </div>
      ) : (
        <>
          {fieldsBlock(form, false)}
          <div className="flex items-center gap-3 mt-4">
            <Button data-testid="settings-verify-button" onClick={verify} disabled={!fields.apiKey.trim()}>验证连接</Button>
            <Button data-testid="settings-ai-save-button" onClick={saveEditing} disabled={!editingId}>保存</Button>
            {!isEditingActive && editingConfig && (
              <Button
                data-testid="settings-activate-llm-config"
                onClick={activate}
                disabled={!editingConfig.apiKey.trim()}
                title={!editingConfig.apiKey.trim() ? '该配置缺少 API Key，无法启用' : undefined}
              >
                启用此配置
              </Button>
            )}
            {verifyStatus && <VerifyHint status={verifyStatus} isAcademic={isAcademic} />}
          </div>
        </>
      )}

      {!draft && (
        <div className="mt-3">
          <button
            data-testid="settings-add-llm-config"
            type="button"
            onClick={startDraft}
            className={`text-xs ${isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#777] hover:text-[#1a1a1a]'} bg-transparent border-none cursor-pointer`}
          >
            + 新增模型配置
          </button>
        </div>
      )}
    </div>
  )
}

function VerifyHint({ status, isAcademic }: { status: VerifyStatus; isAcademic: boolean }) {
  return (
    <span data-testid="settings-verify-status" className={`text-xs ${
      status.kind === 'error' ? 'text-wine' :
      status.kind === 'success' ? (isAcademic ? 'text-ember' : 'text-green-700') :
      (isAcademic ? 'text-parchment/40' : 'text-[#888]')
    }`}>
      {status.message}
    </span>
  )
}
