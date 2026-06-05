import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Cover } from '@/pages/Cover'
import { Home } from '@/pages/Home'
import { Study } from '@/pages/Study'
import { Profile } from '@/pages/Profile'
import { Extension } from '@/pages/Extension'
import { Toast } from '@/components/Toast'
import { PreStudyModal } from '@/components/PreStudyModal'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SetupWizard } from '@/components/SetupWizard'
import { ipc } from '@/lib/ipc'

export function App() {
  const page = useStore(s => s.currentPage)
  const modal = useStore(s => s.modal)
  const init = useStore(s => s.init)
  const [fatal, setFatal] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [isBooting, setIsBooting] = useState(true)

  useEffect(() => {
    Promise.all([ipc.bootFatal(), ipc.bootNeedsSetup()]).then(([f, ns]) => {
      if (f) {
        setFatal(f)
        setIsBooting(false)
        return
      }
      if (ns) {
        setNeedsSetup(true)
        setIsBooting(false)
        return
      }
      // LoadingScreen 显示期间，boot sequence 在后台运行
      // boot:complete 事件会触发 LoadingScreen 的 onComplete
    })
  }, [])

  const handleSetupDone = () => {
    setNeedsSetup(false)
    setIsBooting(true)
  }

  const handleBootComplete = async () => {
    // LoadingScreen 淡出后，初始化 store
    try {
      await init()
    } catch (err: any) {
      console.error('init failed', err)
      useStore.getState().showToast('初始化失败:' + err.message)
    }
    // 探活模型结果
    ipc.llmProbe().then(r => {
      if (!r.ok) {
        const reason = r.reason ?? '未知'
        const msg = reason.includes('401')
          ? 'API Key 无效，请检查 .env 中的 KIMI_API_KEY'
          : '模型不可用:' + reason
        useStore.setState({ modelInvalid: true, modelInvalidReason: reason })
        useStore.getState().showToast(msg)
      }
    }).catch(() => { /* 网络失败,推迟到首次调用 */ })

    setIsBooting(false)
  }

  if (fatal) {
    const isKeyError = fatal.includes('KIMI_API_KEY')
    const isLibraryError = fatal.includes('STUDY_LIBRARY_PATH') || fatal.includes('学习库')

    return (
      <div className="h-full flex items-center justify-center p-8 bg-ink">
        <div className="panel p-10 max-w-md w-full space-y-6">
          {/* 装饰图标 */}
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full border border-ember/40 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-parchment">启动失败</h2>
            <p className="text-sm text-parchment/60">请检查以下配置后重启应用</p>
          </div>

          <div className="divider" />

          {/* 错误描述 */}
          <div className="bg-wine/10 border border-wine/30 rounded-md px-4 py-3">
            <p className="text-sm text-parchment/80 whitespace-pre-wrap">{fatal}</p>
          </div>

          {/* 引导步骤 */}
          {isKeyError && (
            <div className="space-y-3 text-sm text-parchment/70">
              <div className="flex gap-3">
                <span className="text-ember font-medium shrink-0">1</span>
                <p>打开项目根目录的 <code className="bg-ink px-1.5 py-0.5 rounded text-parchment/90 border border-slate/30">.env</code> 文件</p>
              </div>
              <div className="flex gap-3">
                <span className="text-ember font-medium shrink-0">2</span>
                <p>前往你使用的 API 服务商（如 Moonshot、OpenAI、DeepSeek 等）获取真实 API Key</p>
              </div>
              <div className="flex gap-3">
                <span className="text-ember font-medium shrink-0">3</span>
                <p>替换占位符后，<strong className="text-parchment">重启应用</strong></p>
              </div>
            </div>
          )}

          {isLibraryError && (
            <div className="space-y-3 text-sm text-parchment/70">
              <div className="flex gap-3">
                <span className="text-ember font-medium shrink-0">1</span>
                <p>打开项目根目录的 <code className="bg-ink px-1.5 py-0.5 rounded text-parchment/90 border border-slate/30">.env</code> 文件</p>
              </div>
              <div className="flex gap-3">
                <span className="text-ember font-medium shrink-0">2</span>
                <p>确认 <code className="bg-ink px-1.5 py-0.5 rounded text-parchment/90 border border-slate/30">STUDY_LIBRARY_PATH</code> 指向的目录存在</p>
              </div>
              <div className="flex gap-3">
                <span className="text-ember font-medium shrink-0">3</span>
                <p>若目录不存在，先创建该目录，或修改为有效的路径</p>
              </div>
              <div className="flex gap-3">
                <span className="text-ember font-medium shrink-0">4</span>
                <p>保存后<strong className="text-parchment">重启应用</strong></p>
              </div>
            </div>
          )}

          {!isKeyError && !isLibraryError && (
            <div className="text-sm text-parchment/70">
              检查 .env 文件是否存在，并确认其中包含 KIMI_API_KEY 与 STUDY_LIBRARY_PATH。
            </div>
          )}

          <div className="text-xs text-parchment/40 text-center">
            {import.meta.env.DEV
              ? '修改配置后，请按 Ctrl+C 终止进程，然后重新运行 npm run dev'
              : '修改配置后，请关闭应用并重新启动'}
          </div>
        </div>
      </div>
    )
  }

  if (needsSetup) {
    return <SetupWizard onDone={handleSetupDone} />
  }

  return (
    <div className="h-full">
      {isBooting && <LoadingScreen onComplete={handleBootComplete} />}
      {!isBooting && (
        <>
          {page === 'cover' && <Cover />}
          {page === 'home' && <Home />}
          {page === 'study' && <Study />}
          {page === 'profile' && <Profile />}
          {page === 'extension' && <Extension />}
        </>
      )}
      {modal === 'preStudy' && <PreStudyModal />}
      <Toast />
    </div>
  )
}
