import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Markdown from 'react-markdown'
import { reportComponents } from '@/components/md/components'

afterEach(() => {
  cleanup()
})

describe('Heading with section labels', () => {
  it('renders section label for mapped H2 titles', () => {
    render(
      <Markdown components={reportComponents}>{'## 核心概念\n\n内容'}</Markdown>
    )
    expect(screen.getByText('CONCEPT')).toBeInTheDocument()
    expect(screen.getByText('核心概念')).toBeInTheDocument()
  })

  it('renders section label for 学习要点', () => {
    render(
      <Markdown components={reportComponents}>{'## 学习要点\n\n内容'}</Markdown>
    )
    expect(screen.getByText('KEY POINTS')).toBeInTheDocument()
  })

  it('does not render label for unknown H2 titles', () => {
    render(
      <Markdown components={reportComponents}>{'## 随机标题\n\n内容'}</Markdown>
    )
    expect(screen.queryByText('CONCEPT')).not.toBeInTheDocument()
    expect(screen.getByText('随机标题')).toBeInTheDocument()
  })
})
