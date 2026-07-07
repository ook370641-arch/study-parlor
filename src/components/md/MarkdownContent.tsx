import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

class MdErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MD ErrorBoundary]', error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#d97757', padding: '16px' }}>
          <p>渲染失败: {this.state.error?.message}</p>
          <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', color: '#a09080' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

interface Props {
  children: string
  components?: Components
  className?: string
}

export function MarkdownContent({ children, components, className }: Props) {
  return (
    <div className={className}>
      <MdErrorBoundary>
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {children}
        </Markdown>
      </MdErrorBoundary>
    </div>
  )
}
