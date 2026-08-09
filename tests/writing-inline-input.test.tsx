import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { InlineNameInput } from '@/components/writing/InlineNameInput'

describe('InlineNameInput', () => {
  const tid = 'writing-inline-new'
  beforeEach(() => cleanup())

  it('Enter 提交已 trim 的值', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineNameInput dataTestid={tid} defaultValue="8.9" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByTestId(tid), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('8.9')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('空值 Enter 视为取消，不提交', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineNameInput dataTestid={tid} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByTestId(tid), { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('Esc 取消', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineNameInput dataTestid={tid} defaultValue="x" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByTestId(tid), { key: 'Escape' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('失焦取消', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineNameInput dataTestid={tid} defaultValue="x" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.blur(screen.getByTestId(tid))
    expect(onCancel).toHaveBeenCalled()
  })

  it('值变化回调 onValueChange', () => {
    const onValueChange = vi.fn()
    render(<InlineNameInput dataTestid={tid} onSubmit={() => {}} onCancel={() => {}} onValueChange={onValueChange} />)
    fireEvent.change(screen.getByTestId(tid), { target: { value: 'a' } })
    expect(onValueChange).toHaveBeenCalledWith('a')
  })
})
