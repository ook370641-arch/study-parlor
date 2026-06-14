import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { ipc } from '@/lib/ipc'
import type { AppConfig } from '@electron/env'

const DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1'
const DEFAULT_MODEL = 'kimi-k2.6'

type VerifyStatus =
  | { kind: 'idle'; message: '从未验证' }
  | { kind: 'loading'; message: '验证中...' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

export function Settings() {
  const goto = useStore(s => s.goto)
  const showToast = useStore(s => s.showToast)

  const [initialConfig, setInitialConfig] = useState<AppConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [libraryPath, setLibraryPath] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>({ kind: 'idle', message: '从未验证' })

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
    return () => { mounted = false }
  }, [])

  const resetForm = () => {
    if (!initialConfig) return
    setApiKey(initialConfig.apiKey)
    setBaseUrl(initialConfig.baseUrl)
    setModel(initialConfig.model)
    setLibraryPath(initialConfig.libraryPath)
    setError(null)
    setVerifyStatus({ kind: 'idle', message: '从未验证' })
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

  const canSave = apiKey.trim().length > 0 && libraryPath.trim().length > 0
  const canVerify = apiKey.trim().length > 0

  return (
    <div className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-4 z-10" />

      <div className="absolute top-10 left-6 right-6 bottom-5 z-10">
        <div className="max-w-3xl mx-auto h-full flex flex-col">
          <div className="bg-ink/72 backdrop-blur-md border border-slate/30 rounded-xl flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center px-6 pt-5 pb-3 border-b border-slate/25 shrink-0">
              <h2 className="text-2xl font-serif font-semibold">设置 · 仪器调校</h2>
              <button
                onClick={() => goto('home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                返回夜话
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5">
              {error && (
                <div className="mb-4 bg-wine/10 border border-wine/40 rounded-md px-4 py-3">
                  <p className="text-sm text-parchment/80">{error}</p>
                </div>
              )}

              {/* AI 服务 */}
              <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
                <h3 className="text-ember font-semibold mb-4">AI 服务</h3>

                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">API Key</div>
                    <div className="flex gap-2">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="sk-kimi-..."
                        className="flex-1 bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="px-3 py-2 border border-slate/40 rounded-md text-sm text-parchment/80 hover:text-parchment transition-colors shrink-0"
                      >
                        {showKey ? '隐藏' : '显示'}
                      </button>
                    </div>
                    {!canVerify && (
                      <div className="text-xs text-wine mt-1">请输入 API Key</div>
                    )}
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">Base URL</div>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={e => setBaseUrl(e.target.value)}
                      placeholder={DEFAULT_BASE_URL}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">Model</div>
                    <input
                      type="text"
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      placeholder={DEFAULT_MODEL}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <Button onClick={handleVerify} disabled={!canVerify}>
                    验证连接
                  </Button>
                  <span className={`text-xs ${
                    verifyStatus.kind === 'error' ? 'text-wine' :
                    verifyStatus.kind === 'success' ? 'text-green-400' :
                    'text-parchment/40'
                  }`}>
                    {verifyStatus.message}
                  </span>
                </div>
              </div>

              {/* 学习库 */}
              <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
                <h3 className="text-ember font-semibold mb-4">学习库</h3>
                <div>
                  <div className="text-[11px] text-parchment/60 font-sans mb-1">目录路径</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={libraryPath}
                      onChange={e => setLibraryPath(e.target.value)}
                      className="flex-1 bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                    <button
                      type="button"
                      onClick={handleSelectDirectory}
                      className="px-3 py-2 border border-slate/40 rounded-md text-sm text-parchment/80 hover:text-parchment transition-colors shrink-0"
                    >
                      选择目录
                    </button>
                  </div>
                </div>
              </div>

              {/* 保存 */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button onClick={handleSave} disabled={!canSave}>
                    保存
                  </Button>
                  <Button variant="ghost" onClick={resetForm}>
                    作废
                  </Button>
                </div>
                <div className="text-xs text-parchment/40 border-l-2 border-slate/30 pl-3">
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