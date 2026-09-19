import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChatInput } from '@/components/ChatInput'

describe('ChatInput', () => {
  beforeEach(() => cleanup())

  it('Enter 把去掉首尾空白的内容递出', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const input = screen.getByTestId('chat-input')
    fireEvent.change(input, { target: { value: '  你好  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('你好')
    expect(input).toHaveValue('')
  })

  it('Shift+Enter 不递出，留给换行', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const input = screen.getByTestId('chat-input')
    fireEvent.change(input, { target: { value: '第一行' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue('第一行')
  })

  it('IME 组字中的 Enter 不上屏即递出', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'nihao' } })
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'isComposing', { get: () => true })
    input.dispatchEvent(ev)
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue('nihao')
  })

  it('IME keyCode 229 的 Enter 不递出', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const input = screen.getByTestId('chat-input')
    fireEvent.change(input, { target: { value: 'hao' } })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(onSend).not.toHaveBeenCalled()
    expect(input).toHaveValue('hao')
  })
})
