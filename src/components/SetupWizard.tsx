import { useState, useEffect, useCallback } from 'react'
import { ipc } from '@/lib/ipc'

type WizardStep = 1 | 2 | 3 | 4

const DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1'
const DEFAULT_MODEL = 'kimi-k2.6'
const DEFAULT_LIBRARY_PATH = 'C:/Users/User/Documents/studyparlor-library'

type Props = {
  onDone: () => void
}

export function SetupWizard({ onDone }: Props) {
  const [step, setStep] = useState<WizardStep>(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Step 2: API Key
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [showKey, setShowKey] = useState(false)

  // Step 3: Library
  const [libraryPath, setLibraryPath] = useState(DEFAULT_LIBRARY_PATH)

  // Step 4: Profile
  const [name, setName] = useState('')
  const [profileText, setProfileText] = useState('')
  const [preferredTopics, setPreferredTopics] = useState('')

  const clearError = useCallback(() => setError(null), [])

  const handleProbeKey = async () => {
    clearError()
    if (!apiKey.trim()) {
      setError('请输入 API Key')
      return
    }
    setLoading(true)
    try {
      const result = await ipc.setupProbeKey({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        model: model.trim() || DEFAULT_MODEL,
      })
      if (result.ok) {
        setStep(3)
      } else {
        setError(result.reason || '验证失败，请检查 API Key')
      }
    } catch (err: any) {
      setError(err.message || '验证请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDirectory = async () => {
    clearError()
    try {
      const result = await ipc.setupSelectDirectory()
      if (!result.canceled && result.path) {
        setLibraryPath(result.path)
      }
    } catch (err: any) {
      setError(err.message || '选择目录失败')
    }
  }

  const handleWriteConfig = async () => {
    clearError()
    if (!name.trim()) {
      setError('请输入昵称')
      return
    }
    setLoading(true)
    try {
      await ipc.setupWriteConfig({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        model: model.trim() || DEFAULT_MODEL,
        libraryPath: libraryPath.trim() || DEFAULT_LIBRARY_PATH,
        name: name.trim(),
        profile_text: profileText.trim() || undefined,
        preferred_topics: preferredTopics.trim()
          ? preferredTopics.split(/[,，]/).map(t => t.trim()).filter(t => t.length > 0)
          : undefined,
      })
    } catch (err: any) {
      setError(err.message || '保存配置失败')
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsub = ipc.onSetupDone(() => {
      onDone()
    })
    return unsub
  }, [onDone])

  const stepLabels = ['欢迎', 'AI 服务', '学习库', '名片']

  return (
    <div className="h-full flex items-center justify-center p-8 bg-ink">
      <div className="panel p-8 max-w-lg w-full">
        {/* Progress bar */}
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3, 4].map((s, i) => {
            const isCompleted = step > s
            const isCurrent = step === s

            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    data-testid={`wizard-step-${s}`}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isCompleted
                        ? 'bg-ember text-ink'
                        : isCurrent
                          ? 'bg-ember text-ink ring-2 ring-ember/40'
                          : 'bg-slate/30 text-parchment/50'
                    }`}
                  >
                    {isCompleted ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      s
                    )}
                  </div>
                  <span className={`text-xs mt-1.5 ${isCurrent ? 'text-ember' : isCompleted ? 'text-parchment/70' : 'text-parchment/40'}`}>
                    {stepLabels[i]}
                  </span>
                </div>
                {i < 3 && (
                  <div className={`flex-1 h-px mx-2 ${isCompleted ? 'bg-ember/60' : 'bg-slate/30'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Error display */}
        {error && (
          <div data-testid="wizard-error-display" className="mb-6 bg-wine/10 border border-wine/40 rounded-md px-4 py-3">
            <p className="text-sm text-parchment/80">{error}</p>
          </div>
        )}

        {/* Step content */}
        <div className="space-y-6">
          {step === 1 && (
            <>
              <div className="text-center space-y-4">
                {/* Decorative book icon */}
                <div className="flex justify-center">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d97757" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    <line x1="10" y1="8" x2="16" y2="8" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-parchment">欢迎来到学者夜话</h1>
                  <p className="text-parchment/60 mt-1">你的个人 AI 学习助手</p>
                </div>
                <p className="text-sm text-parchment/50 leading-relaxed">
                  首次使用需要完成三个简单的配置，大约需要 2 分钟。配置完成后即可开始学习之旅。
                </p>
              </div>
              <div className="flex justify-center pt-2">
                <button
                  data-testid="wizard-next-button"
                  onClick={() => { clearError(); setStep(2) }}
                  className="relative inline-block px-8 py-2.5 font-sans bg-ember text-ink shadow-[3px_3px_0_0_#3a5a6a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#3a5a6a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-[transform,box-shadow] duration-100"
                >
                  开始配置
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-parchment">配置 AI 服务</h2>
                <p className="text-sm text-parchment/60 mt-1">输入你的 API Key，我们会验证其有效性</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="field-label">API Key</label>
                  <div className="relative">
                    <input
                      data-testid="wizard-api-key-input"
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => { setApiKey(e.target.value); clearError() }}
                      placeholder="sk-kimi-..."
                      className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60 pr-10"
                    />
                    <button
                      data-testid="wizard-api-key-toggle"
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-parchment/40 hover:text-parchment/70 transition-colors"
                      tabIndex={-1}
                    >
                      {showKey ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">Base URL</label>
                  <input
                    data-testid="wizard-base-url-input"
                    type="text"
                    value={baseUrl}
                    onChange={(e) => { setBaseUrl(e.target.value); clearError() }}
                    placeholder={DEFAULT_BASE_URL}
                    className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">Model</label>
                  <input
                    data-testid="wizard-model-input"
                    type="text"
                    value={model}
                    onChange={(e) => { setModel(e.target.value); clearError() }}
                    placeholder={DEFAULT_MODEL}
                    className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                  />
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button
                  data-testid="wizard-back-button"
                  onClick={() => { clearError(); setStep(1) }}
                  className="px-4 py-2 text-parchment/80 hover:text-parchment transition-colors text-sm"
                >
                  返回
                </button>
                <button
                  data-testid="wizard-next-button"
                  onClick={handleProbeKey}
                  disabled={loading}
                  className="relative inline-block px-6 py-2 font-sans bg-ember text-ink shadow-[3px_3px_0_0_#3a5a6a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#3a5a6a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-[transform,box-shadow] duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '验证中...' : '验证并继续'}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-parchment">选择学习库位置</h2>
                <p className="text-sm text-parchment/60 mt-1">存放学习笔记的目录</p>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-parchment/50 leading-relaxed">
                  学习库是你存放所有学习笔记的目录。每次学习结束后，学者夜话会自动在这里创建新的笔记文件。你可以随时在学习库中查看、编辑这些笔记。
                </p>
                <div className="space-y-1.5">
                  <label className="field-label">目录路径</label>
                  <div className="flex gap-2">
                    <input
                      data-testid="wizard-library-path-input"
                      type="text"
                      value={libraryPath}
                      onChange={(e) => { setLibraryPath(e.target.value); clearError() }}
                      className="flex-1 bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                    <button
                      data-testid="wizard-select-directory-button"
                      onClick={handleSelectDirectory}
                      className="px-4 py-2 border border-slate/40 rounded-md text-sm text-parchment/80 hover:text-parchment hover:border-slate/60 transition-colors shrink-0"
                    >
                      选择目录
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button
                  data-testid="wizard-back-button"
                  onClick={() => { clearError(); setStep(2) }}
                  className="px-4 py-2 text-parchment/80 hover:text-parchment transition-colors text-sm"
                >
                  返回
                </button>
                <button
                  data-testid="wizard-next-button"
                  onClick={() => { clearError(); setStep(4) }}
                  className="relative inline-block px-6 py-2 font-sans bg-ember text-ink shadow-[3px_3px_0_0_#3a5a6a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#3a5a6a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-[transform,box-shadow] duration-100"
                >
                  确认并继续
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-parchment">你的学习名片</h2>
                <p className="text-sm text-parchment/60 mt-1">让 AI 更了解你</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="field-label">
                    昵称 <span className="text-wine">*</span>
                  </label>
                  <input
                    data-testid="wizard-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearError() }}
                    placeholder="怎么称呼你？"
                    className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">个人简介</label>
                  <textarea
                    data-testid="wizard-profile-text-input"
                    value={profileText}
                    onChange={(e) => { setProfileText(e.target.value); clearError() }}
                    placeholder="你的学习背景、目标或任何想让 AI 了解的信息..."
                    rows={3}
                    className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60 resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">感兴趣的话题</label>
                  <input
                    data-testid="wizard-preferred-topics-input"
                    type="text"
                    value={preferredTopics}
                    onChange={(e) => { setPreferredTopics(e.target.value); clearError() }}
                    placeholder="用逗号分隔，如：机器学习，心理学，历史"
                    className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                  />
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button
                  data-testid="wizard-back-button"
                  onClick={() => { clearError(); setStep(3) }}
                  className="px-4 py-2 text-parchment/80 hover:text-parchment transition-colors text-sm"
                >
                  返回
                </button>
                <button
                  data-testid="wizard-next-button"
                  onClick={handleWriteConfig}
                  disabled={loading}
                  className="relative inline-block px-6 py-2 font-sans bg-ember text-ink shadow-[3px_3px_0_0_#3a5a6a] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#3a5a6a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-[transform,box-shadow] duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '保存中...' : '开始使用'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
