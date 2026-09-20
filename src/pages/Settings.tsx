import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import { LlmConfigCard } from '@/components/settings/LlmConfigCard'
import { ipc } from '@/lib/ipc'
import { DEFAULT_JOB_BRIEFING_CONFIG } from '@/lib/job-briefing-defaults'
import type { JobBriefingConfig } from '@shared/index'

export function Settings() {
  const goto = useStore(s => s.goto)
  const settingsReturnTo = useStore(s => s.settingsReturnTo)
  const showToast = useStore(s => s.showToast)
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  const archivedTopics = useStore((s) => s.archivedTopics)
  const restoreTopic = useStore((s) => s.restoreTopic)

  const [libraryPath, setLibraryPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [searchApiKey, setSearchApiKey] = useState('')
  const [showSearchKey, setShowSearchKey] = useState(false)
  const [searchConfigured, setSearchConfigured] = useState(false)
  const [jobConfig, setJobConfig] = useState<JobBriefingConfig>(DEFAULT_JOB_BRIEFING_CONFIG)
  const [jobConfigSaving, setJobConfigSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    ipc.getConfig().then(cfg => {
      if (!mounted) return
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

  const handleRestoreTopic = async (dirName: string) => {
    try {
      await restoreTopic(dirName)
      showToast(`「${dirName}」已恢复`)
    } catch (err: any) {
      showToast('恢复失败：' + (err?.message ?? err))
    }
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
              <LlmConfigCard isAcademic={isAcademic} showToast={showToast} onError={setError} />

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
                  <div className="mt-2 flex items-center justify-between">
                    <div className={`text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#888]'}`}>保存后需重启应用生效。</div>
                    <Button data-testid="settings-library-save-button" onClick={async () => {
                      await ipc.configSetLibraryPath(libraryPath.trim())
                      showToast('学习库路径已保存')
                    }} disabled={!libraryPath.trim()}>
                      保存
                    </Button>
                  </div>
                </div>
              </div>

              {/* 已归档主题 */}
              <div className={`${isAcademic ? 'bg-parchment/5 border-slate/20' : 'bg-white border-[#1a1a1a]/10'} border rounded-lg p-4 mb-4`}>
                <h3 className={`${isAcademic ? 'text-ember' : 'text-[#1a1a1a]'} font-semibold mb-4`}>已归档主题</h3>
                {archivedTopics.length === 0 ? (
                  <div className={`text-sm ${isAcademic ? 'text-parchment/40' : 'text-[#888]'}`}>
                    暂无归档的主题。
                  </div>
                ) : (
                  <ul data-testid="settings-archived-topics" className="space-y-2">
                    {archivedTopics.map((dirName) => (
                      <li key={dirName} className="flex items-center justify-between gap-3">
                        <span className={`text-sm truncate ${isAcademic ? 'text-parchment/80' : 'text-[#555]'}`}>{dirName}</span>
                        <button
                          data-testid="settings-restore-topic-button"
                          onClick={() => handleRestoreTopic(dirName)}
                          className={`px-3 py-1 text-xs border rounded transition-colors shrink-0 ${isAcademic ? 'border-slate/40 text-parchment/80 hover:border-ember hover:text-ember' : 'border-[#1a1a1a]/15 text-[#555] hover:border-[#1a1a1a]/25 hover:text-[#1a1a1a]'}`}
                        >
                          恢复
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
