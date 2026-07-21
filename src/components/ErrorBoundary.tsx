import { Component, type ReactNode } from 'react'
import { useStore } from '@/store'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const goto = useStore((s) => s.goto)
  return (
    <div
      data-testid="app-error-fallback"
      className="h-full flex flex-col items-center justify-center gap-4 p-8 text-parchment"
    >
      <p className="text-lg font-serif">页面出现异常</p>
      <p className="text-sm text-parchment/50 max-w-md text-center break-all">{error.message}</p>
      <div className="flex gap-3">
        <button
          data-testid="app-error-retry"
          className="px-4 py-2 rounded bg-ember text-white text-sm hover:bg-ember/90"
          onClick={onReset}
        >
          重试
        </button>
        <button
          data-testid="app-error-home"
          className="px-4 py-2 rounded border border-parchment/30 text-sm text-parchment/80 hover:border-parchment/60"
          onClick={() => {
            onReset()
            goto('home')
          }}
        >
          返回首页
        </button>
      </div>
    </div>
  )
}
