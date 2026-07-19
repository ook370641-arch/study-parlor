import { describe, it, expect } from 'vitest'
import { wrapWriting } from '../electron/ipc/writing'

it('lib 错误码映射为 WritingResult', async () => {
  const r = await wrapWriting(() => { const e = new Error('x'); (e as any).code = 'WRITING_NOT_FOUND'; throw e })
  expect(r).toEqual({ ok: false, code: 'WRITING_NOT_FOUND', message: 'x' })
})
it('未知错误映射为 WRITING_IO_ERROR', async () => {
  const r = await wrapWriting(() => { throw new Error('boom') })
  expect(r.ok).toBe(false)
  expect((r as any).code).toBe('WRITING_IO_ERROR')
})
it('正常返回包装为 ok:true', async () => {
  const r = await wrapWriting(() => 42)
  expect(r).toEqual({ ok: true, value: 42 })
})
