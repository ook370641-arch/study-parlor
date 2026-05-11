import { useState, useEffect } from 'react'
import { useStore } from '@/store'

export function Toast() {
  const toast = useStore(s => s.toast)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (!toast) {
      setIsExiting(false)
      return
    }
    setIsExiting(false)
    const exitTimer = setTimeout(() => setIsExiting(true), 1800)
    const removeTimer = setTimeout(() => useStore.setState({ toast: null }), 2000)
    return () => {
      clearTimeout(exitTimer)
      clearTimeout(removeTimer)
    }
  }, [toast?.ts])

  if (!toast) return null

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2
                    panel text-parchment shadow-lg z-50 font-sans text-sm
                    ${isExiting ? 'toast-exit' : 'toast-enter'}`}>
      {toast.message}
    </div>
  )
}
