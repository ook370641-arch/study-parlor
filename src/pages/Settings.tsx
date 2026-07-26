import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import { ipc } from '@/lib/ipc'
import { DEFAULT_JOB_BRIEFING_CONFIG } from '@/lib/job-briefing-defaults'
import type { AppConfig } from '@electron/env'
import type { JobBriefingConfig } from '@shared/index'

const DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1'
const DEFAULT_MODEL = 'kimi-k2.6'

type VerifyStatus =
  | { kind: 'loading'; message: '验证中...' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

export function Settings() {
  const goto = useStore(s => s.goto)
  const settingsReturnTo = useStore(s => s.settingsReturnTo)
  const showToast = useStore(s => s.showToast)
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'

  const [initialConfig, setInitialConfig] = useState<AppConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [libraryPath, setLibraryPath] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus | null>(null)
  const [searchApiKey, setSearchApiKey] = useState('')
  const [showSearchKey, setShowSearchKey] = useState(false)
  const [searchConfigured, setSearchConfigured] = useState(false)
  const [jobConfig, setJobConfig] = useState<JobBriefingConfig>(DEFAULT_JOB_BRIEFING_CONFIG)
  const [jobConfigSaving, setJobConfigSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    ipc.getConfig().then(cfg => {
      if (!mounted) return
      setInitialConfig(cfg)
      setApiKey(cfg.apiKey)
      setBaseUrl(cfg.baseUrl)
      setModel(cfg.model)
      setLibraryPath(cfg.libraryPath)
    }).catch(err => {
      setError(err.message || '读取配置失败')
    })
    ipc.searchCheckConfig()
      .then(({ configured }) => { if (mounted) setSearchConfigured(configured) })
      .catch(err => { if (mounted) setError(err.message || '读取搜索配置失败') })
    ipc.getState()
      .then(state => {
        if (!mounted) return
        setJobConfig(state.jobBriefingConfig ?? DEFAULT_JOB_BRIEFING_CONFIG)
      })
      .catch(err => { if (mounted) setError(err.message || '读取求职简报配置失败') })
    return () => { mounted = false }
  }, [])

  const resetForm = () => {
    if (!initialConfig) return
    setApiKey(initialConfig.apiKey)
    setBaseUrl(initialConfig.baseUrl)
    setModel(initialConfig.model)
    setLibraryPath(initialConfig.libraryPath)
    setSearchApiKey('')
    setError(null)
    setVerifyStatus(null)
  }

  const handleSelectDirectory = async () => {
    try {
      const result = await ipc.setupSelectDirectory()
      if (!result.canceled && result.path) {
        setLibraryPath(result.path)
      }
    } catch (err: any) {
      setError(err.message || '选择目录失败')
    }
  }

  const handleVerify = async () => {
    setError(null)
    setVerifyStatus({ kind: 'loading', message: '验证中...' })
    try {
      const result = await ipc.setupProbeKey({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        model: model.trim() || DEFAULT_MODEL
      })
      if (result.ok) {
        setVerifyStatus({ kind: 'success', message: '连接正常' })
      } else {
        setVerifyStatus({ kind: 'error', message: result.reason || '验证失败' })
      }
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

  const handleSave = async () => {
    setError(null)
    const config: AppConfig = {
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
      model: model.trim() || DEFAULT_MODEL,
      libraryPath: libraryPath.trim()
    }
    try {
      await ipc.writeConfig(config)
      setInitialConfig(config)
      showToast('配置已保存，重启后生效')
    } catch (err: any) {
      setError(err.message || '保存配置失败')
    }
  }

  const handleSaveSearchKey = async () => {
    setError(null)
    const key = searchApiKey.trim()
    if (!key) {
      setError('请输入 Tavily API Key')
      return
    }
    try {
      await ipc.setSearchApiKey(key)
      setSearchApiKey('')
      setSearchConfigured(true)
      showToast('Tavily API Key 已保存')
    } catch (err: any) {
      setError(err.message || '保存 Tavily API Key 失败')
    }
  }

  const canSave = apiKey.trim().length > 0 && libraryPath.trim().length > 0
  const canVerify = apiKey.trim().length > 0

  const handleSaveJobConfig = async () => {
    setJobConfigSaving(true)
    setError(null)
    try {
      await useStore.getState().setJobBriefingConfig(jobConfig)
      showToast('求职简报配置已保存')
    } catch (err: any) {
      setError(err.message || '保存求职简报配置失败')
    } finally {
      setJobConfigSaving(false)
    }
  }

  const handleResetJobConfig = () => {
    setJobConfig(DEFAULT_JOB_BRIEFING_CONFIG)
  }

  return (
    <div data-testid="settings-page" className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <StudyControlsGroup surface="home" className="absolute top-4 right-4 z-10" />

      <div className="absolute top-10 left-6 right-6 bottom-5 z-10">
        <div className="max-w-3xl mx-auto h-full flex flex-col">
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

            <div className="overflow-y-auto flex-1 px-6 py-5">
              {error && (
                <div data-testid="settings-error-display" className={`mb-4 ${isAcademic ? 'bg-wine/10 border-wine/40' : 'bg-red-50 border-red-200'} border rounded-md px-4 py-3`}>
                  <p className={`text-sm ${isAcademic ? 'text-parchment/80' : 'text-[#1a1a1a]'}`}>{error}</p>
                </div>
              )}

              {/* AI 服务 */}
              <div className={`${isAcademic ? 'bg-parchment/5 border-slate/20' : 'bg-white border-[#1a1a1a]/10'} border rounded-lg p-4 mb-4`}>
                <h3 className={`${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'} font-semibold mb-4`}>AI 服务</h3>

                <div className="space-y-4">
                  <div>
                    <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>API Key</div>
                    <div className="flex gap-2">
                      <input
                        data-testid="settings-api-key-input"
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="sk-kimi-..."
                        className={`flex-1 ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`}
                      />
                      <button
                        data-testid="settings-api-key-toggle"
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className={`px-3 py-2 border ${isAcademic ? 'border-slate/40 text-parchment/80 hover:text-parchment' : 'border-[#1a1a1a]/15 text-[#555] hover:text-[#1a1a1a]'} rounded-md text-sm transition-colors shrink-0`}
                      >
                        {showKey ? '隐藏' : '显示'}
                      </button>
                    </div>
                    {!canVerify && (
                      <div className="text-xs text-wine mt-1">请输入 API Key</div>
                    )}
                  </div>

                  <div>
                    <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>Base URL</div>
                    <input
                      data-testid="settings-base-url-input"
                      type="text"
                      value={baseUrl}
                      onChange={e => setBaseUrl(e.target.value)}
                      placeholder={DEFAULT_BASE_URL}
                      className={`w-full ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`}
                    />
                  </div>

                  <div>
                    <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>Model</div>
                    <input
                      data-testid="settings-model-input"
                      type="text"
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      placeholder={DEFAULT_MODEL}
                      className={`w-full ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <Button data-testid="settings-verify-button" onClick={handleVerify} disabled={!canVerify}>
                    验证连接
                  </Button>
                  {verifyStatus && (
                    <span data-testid="settings-verify-status" className={`text-xs ${
                      verifyStatus.kind === 'error' ? 'text-wine' :
                      verifyStatus.kind === 'success' ? (isAcademic ? 'text-ember' : 'text-green-700') :
                      (isAcademic ? 'text-parchment/40' : 'text-[#888]')
                    }`}>
                      {verifyStatus.message}
                    </span>
                  )}
                </div>
              </div>

              {/* 联网搜索 */}
              <div className={`${isAcademic ? 'bg-parchment/5 border-slate/20' : 'bg-white border-[#1a1a1a]/10'} border rounded-lg p-4 mb-4`}>
                <h3 className={`${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'} font-semibold mb-4`}>联网搜索</h3>

                <div className="space-y-4">
                  <div>
                    <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>Tavily API Key</div>
                    <div className="flex gap-2">
                      <input
                        data-testid="settings-search-api-key-input"
                        type={showSearchKey ? 'text' : 'password'}
                        value={searchApiKey}
                        onChange={e => setSearchApiKey(e.target.value)}
                        placeholder={searchConfigured ? '已配置，输入新 key 可覆盖' : 'tvly-...'}
                        className={`flex-1 ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`}
                      />
                      <button
                        data-testid="settings-search-api-key-toggle"
                        type="button"
                        onClick={() => setShowSearchKey(!showSearchKey)}
                        className={`px-3 py-2 border ${isAcademic ? 'border-slate/40 text-parchment/80 hover:text-parchment' : 'border-[#1a1a1a]/15 text-[#555] hover:text-[#1a1a1a]'} rounded-md text-sm transition-colors shrink-0`}
                      >
                        {showSearchKey ? '隐藏' : '显示'}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className={`text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#888]'}`}>
                        Key 会加密存储在系统密钥库中，不会写入 .env 文件；联网资料仅在你主动开启时使用。
                      </div>
                      <Button data-testid="settings-search-save-button" onClick={handleSaveSearchKey} disabled={!searchApiKey.trim()}>
                        保存
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 学习库 */}
              <div className={`${isAcademic ? 'bg-parchment/5 border-slate/20' : 'bg-white border-[#1a1a1a]/10'} border rounded-lg p-4 mb-4`}>
                <h3 className={`${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'} font-semibold mb-4`}>学习库</h3>
                <div>
                  <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>目录路径</div>
                  <div className="flex gap-2">
                    <input
                      data-testid="settings-library-path-input"
                      type="text"
                      value={libraryPath}
                      onChange={e => setLibraryPath(e.target.value)}
                      className={`flex-1 ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`}
                    />
                    <button
                      data-testid="settings-select-directory-button"
                      type="button"
                      onClick={handleSelectDirectory}
                      className={`px-3 py-2 border ${isAcademic ? 'border-slate/40 text-parchment/80 hover:text-parchment' : 'border-[#1a1a1a]/15 text-[#555] hover:text-[#1a1a1a]'} rounded-md text-sm transition-colors shrink-0`}
                    >
                      选择目录
                    </button>
                  </div>
                </div>
              </div>

              {/* 求职简报 */}
              <div className={`${isAcademic ? 'bg-parchment/5 border-slate/20' : 'bg-white border-[#1a1a1a]/10'} border rounded-lg p-4 mb-4`}>
                <h3 className={`${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'} font-semibold mb-4`}>求职简报</h3>

                <div className="space-y-4">
                  <div>
                    <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>目标岗位关键词（逗号分隔）</div>
                    <input
                      data-testid="settings-job-role-keywords"
                      type="text"
                      value={jobConfig.roleKeywords.join('，')}
                      onChange={e => setJobConfig(prev => ({ ...prev, roleKeywords: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) }))}
                      className={`w-full ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`}
                    />
                  </div>

                  <div>
                    <div className={`text-[11px] ${isAcademic ? 'text-parchment/60' : 'text-[#777]'} font-sans mb-1`}>目标城市（逗号分隔）</div>
                    <input
                      data-testid="settings-job-cities"
                      type="text"
                      value={jobConfig.cities.join('，')}
                      onChange={e => setJobConfig(prev => ({ ...prev, cities: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) }))}
                      className={`w-full ${isAcademic ? 'bg-ink/50 border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember/60' : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'} border rounded-md px-3 py-2 text-sm focus:outline-none`}
                    />
                  </div>

                  <div className="text-xs text-parchment/50 mt-4">
                    关注公司、个人档案、搜索关键词请在
                    <button
                      data-testid="settings-goto-job-profile"
                      onClick={() => goto('briefing')}
                      className="underline text-ember hover:text-ember/80 mx-1"
                    >
                      求职简报页面
                    </button>
                    中编辑
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button data-testid="settings-job-save" onClick={handleSaveJobConfig} disabled={jobConfigSaving}>
                      保存求职简报配置
                    </Button>
                    <Button data-testid="settings-job-reset" variant="ghost" onClick={handleResetJobConfig}>
                      恢复默认
                    </Button>
                  </div>
                </div>
              </div>

              {/* 保存 */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button data-testid="settings-save-button" onClick={handleSave} disabled={!canSave}>
                    保存
                  </Button>
                  <Button data-testid="settings-reset-button" variant="ghost" onClick={resetForm}>
                    作废
                  </Button>
                </div>
                <div className={`text-xs ${isAcademic ? 'text-parchment/40 border-slate/30' : 'text-[#888] border-[#1a1a1a]/10'} border-l-2 pl-3`}>
                  保存后需重启应用，改动才会生效。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
