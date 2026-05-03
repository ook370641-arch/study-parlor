import { useEffect } from 'react'
import { useStore } from '@/store'
import { Cover } from '@/pages/Cover'
import { Home } from '@/pages/Home'
import { Toast } from '@/components/Toast'
import { ipc } from '@/lib/ipc'

export function App() {
  const page = useStore(s => s.currentPage)
  const init = useStore(s => s.init)

  useEffect(() => {
    init().catch(err => {
      console.error('init failed', err)
      useStore.getState().showToast('初始化失败:' + err.message)
    })

    // 探活模型
    ipc.llmProbe().then(r => {
      if (!r.ok) {
        useStore.setState({ modelInvalid: true, modelInvalidReason: r.reason })
        useStore.getState().showToast('模型不可用:' + (r.reason ?? '未知'))
      }
    }).catch(() => { /* 网络失败,推迟到首次调用 */ })
  }, [])

  return (
    <div className="h-full">
      {page === 'cover'   && <Cover />}
      {page === 'home'    && <Home />}
      {page === 'study'   && <div className="p-8">[Study 占位] (Task 20)</div>}
      {page === 'profile' && <div className="p-8">[Profile 占位] (Task 22)</div>}
      <Toast />
    </div>
  )
}
