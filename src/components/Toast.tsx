import { useEffect } from 'react'
import { useStore } from '@/store'

export function Toast() {
  const toast = useStore(s => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useStore.setState({ toast: null }), 2000)
    return () => clearTimeout(t)
  }, [toast?.ts])
  if (!toast) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2
                    panel text-parchment shadow-lg z-50 font-sans text-sm toast-enter">
      {toast.message}
    </div>
  )
}
