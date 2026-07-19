import { useEffect, useState, lazy, Suspense } from 'react'
import { useStore } from '@/store'
import { Toast } from '@/components/Toast'
import { PreStudyModal } from '@/components/PreStudyModal'
import { LoadingScreen } from '@/components/LoadingScreen'
import { SetupWizard } from '@/components/SetupWizard'
import { ipc } from '@/lib/ipc'
import { attachAssistantSessionListeners } from '@/lib/assistant-session-runtime'
import { attachWritingAssistantListeners } from '@/lib/writing-assistant-runtime'

// Lazy-load pages to reduce Vite dev-server first-page transform cost.
// All 7 pages + their dependency trees were eagerly parsed on startup, but the
// user only needs one.  Lazy loading cuts the initial module graph roughly in
// half, which is especially noticeable on Windows where Vite's esbuild
// transform pipeline is 3–5× slower than on macOS/Linux.
// Pages use named exports; React.lazy needs a default export.
const Cover    = lazy(() => import('@/pages/Cover').then(m => ({ default: m.Cover })))
const Home     = lazy(() => import('@/pages/Home').then(m => ({ default: m.Home })))
const Study    = lazy(() => import('@/pages/Study').then(m => ({ default: m.Study })))
const Profile  = lazy(() => import('@/pages/Profile').then(m => ({ default: m.Profile })))
const Extension = lazy(() => import('@/pages/Extension').then(m => ({ default: m.Extension })))
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })))
const Briefing = lazy(() => import('@/pages/Briefing').then(m => ({ default: m.Briefing })))

export function App() {
  const page = useStore(s => s.currentPage)
  const modal = useStore(s => s.modal)
  const init = useStore(s => s.init)
  const [fatal, setFatal] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [isBooting, setIsBooting] = useState(true)

  useEffect(() => {
    const tMount = performance.now()
    window.api?.logTiming('App mounted', tMount)

    Promise.all([ipc.bootFatal(), ipc.bootNeedsSetup()]).then(([f, ns]) => {
      window.api?.logTiming('App boot checks resolved', performance.now())
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

  // Attach article assistant streaming listeners once globally
  useEffect(() => { attachAssistantSessionListeners() }, [])
  useEffect(() => { attachWritingAssistantListeners() }, [])

  // After boot, prefetch the common page chunks during idle. Pages are
  // React.lazy (see below) wrapped in <Suspense fallback={null}>, so the first
  // navigation into a not-yet-loaded page renders nothing while its chunk is
  // fetched/transformed — showing the brown app background for a beat (very
  // noticeable in dev on Windows). Warming the chunks means Suspense never
  // trips on first open.
  useEffect(() => {
    if (isBooting) return
    const prefetch = () => {
      import('@/pages/Home')
      import('@/pages/Study')
      import('@/pages/Briefing')
    }
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prefetch)
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(prefetch, 300)
    return () => clearTimeout(t)
  }, [isBooting])

  const handleSetupDone = () => {
    setNeedsSetup(false)
    setIsBooting(true)
  }

  const handleBootComplete = async () => {
    const tBoot = performance.now()
    window.api?.logTiming('App boot:complete received', tBoot)

    // 在 boot 期间预加载首屏页面（Cover），并在关闭 LoadingScreen 前
    // 确保 chunk 已就绪。Cover 是 React.lazy 的，若模块未就绪时触发
    // 重渲染，Suspense 会渲染 fallback=null，露出棕色背景。
    // 宁可 LoadingScreen 多停片刻，也不让用户看到棕色闪屏。
    const coverReady = import('@/pages/Cover')

    // 与 Cover 加载并行执行 store 初始化
    window.api?.logTiming('App store.init start', performance.now())
    try {
      await init()
      window.api?.logTiming('App store.init done', performance.now())
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

    // 确保 Cover chunk 已就绪再关闭 LoadingScreen，杜绝棕色闪屏
    await coverReady
    window.api?.logTiming('App Cover chunk ready', performance.now())
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
        <Suspense fallback={null}>
          {page === 'cover' && <Cover />}
          {page === 'home' && <Home />}
          {page === 'study' && <Study />}
          {page === 'profile' && <Profile />}
          {page === 'extension' && <Extension />}
          {page === 'settings' && <Settings />}
          {page === 'briefing' && <Briefing />}
        </Suspense>
      )}
      {modal === 'preStudy' && <PreStudyModal />}
      <Toast />
    </div>
  )
}
