import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Cover } from '@/pages/Cover'
import { Home } from '@/pages/Home'
import { Study } from '@/pages/Study'
import { Profile } from '@/pages/Profile'
import { Toast } from '@/components/Toast'
import { PreStudyModal } from '@/components/PreStudyModal'
import { ipc } from '@/lib/ipc'

export function App() {
  const page = useStore(s => s.currentPage)
  const modal = useStore(s => s.modal)
  const init = useStore(s => s.init)
  const [fatal, setFatal] = useState<string | null>(null)

  useEffect(() => {
    ipc.bootFatal().then(f => {
      if (f) { setFatal(f); return }
      init().catch(err => {
        console.error('init failed', err)
        useStore.getState().showToast('初始化失败:' + err.message)
      })

      // 探活模型
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
    })
  }, [])

  if (fatal) {
    const isKeyError = fatal.includes('KIMI_API_KEY')
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="panel p-8 max-w-lg space-y-4">
          <h2 className="text-xl text-wine">配置错误</h2>
          <pre className="text-sm whitespace-pre-wrap font-sans text-parchment/70">{fatal}</pre>

          {isKeyError && (
            <div className="space-y-2 text-sm text-parchment/70">
              <p>1. 打开项目根目录的 <code className="bg-ink px-1 rounded">.env</code> 文件</p>
              <p>2. 前往 https://platform.moonshot.cn/ 获取真实 API Key</p>
              <p>3. 替换占位符后，<strong className="text-parchment">重启应用</strong>（Ctrl+C 后重新 npm run dev）</p>
            </div>
          )}

          <div className="text-xs text-parchment/50">
            检查 .env 是否存在且包含 KIMI_API_KEY 与 STUDY_LIBRARY_PATH。
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full">
      {page === 'cover'   && <Cover />}
      {page === 'home'    && <Home />}
      {page === 'study'   && <Study />}
      {page === 'profile' && <Profile />}
      {modal === 'preStudy' && <PreStudyModal />}
      <Toast />
    </div>
  )
}
