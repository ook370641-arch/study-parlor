import { describe, expect, it } from 'vitest'
import { createRunQueue } from '../electron/lib/run-queue'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('run-queue（抓取窗口串行化）', () => {
  it('并发 enqueue 串行执行：前一个未结束前第二个不启动', async () => {
    const q = createRunQueue()
    const a = deferred<string>()
    let bStarted = false

    const pa = q.enqueue('https://a', () => a.promise)
    const pb = q.enqueue('https://b', () => {
      bStarted = true
      return Promise.resolve('b')
    })

    await Promise.resolve()
    expect(bStarted).toBe(false)

    a.resolve('A')
    await pa
    await expect(pb).resolves.toBe('b')
    expect(bStarted).toBe(true)
  })

  it('按 FIFO 顺序执行，结果各自回传', async () => {
    const q = createRunQueue()
    const started: string[] = []
    const mk = (url: string, ms: number) =>
      q.enqueue(url, async () => {
        started.push(url)
        await new Promise((r) => setTimeout(r, ms))
        return url
      })
    const results = await Promise.all([mk('u1', 30), mk('u2', 0), mk('u3', 0)])
    expect(started).toEqual(['u1', 'u2', 'u3'])
    expect(results).toEqual(['u1', 'u2', 'u3'])
  })

  it('cancelQueued(url) 只取消匹配的等待任务，报错 cancelled', async () => {
    const q = createRunQueue()
    const blocker = deferred<string>()
    const running = q.enqueue('https://running', () => blocker.promise)

    const w1 = q.enqueue('https://x', async () => 'x')
    const w2 = q.enqueue('https://y', async () => 'y')
    const w3 = q.enqueue('https://x', async () => 'x2')

    const n = q.cancelQueued('https://x')
    expect(n).toBe(2)
    await expect(w1).rejects.toThrow('cancelled')
    await expect(w3).rejects.toThrow('cancelled')

    blocker.resolve('done')
    await running
    await expect(w2).resolves.toBe('y')
  })

  it('cancelQueued() 不带 url 清空全部等待任务，不影响正在运行的', async () => {
    const q = createRunQueue()
    const blocker = deferred<string>()
    const running = q.enqueue('https://running', () => blocker.promise)
    const w1 = q.enqueue('https://a', async () => 'a')
    const w2 = q.enqueue('https://b', async () => 'b')

    expect(q.cancelQueued()).toBe(2)
    await expect(w1).rejects.toThrow('cancelled')
    await expect(w2).rejects.toThrow('cancelled')
    expect(q.activeUrl()).toBe('https://running')

    blocker.resolve('ok')
    await expect(running).resolves.toBe('ok')
    expect(q.activeUrl()).toBeNull()
  })

  it('运行中的任务不出现在 cancelQueued 射程内；exec 同步抛错也走拒绝路径', async () => {
    const q = createRunQueue()
    const boom = q.enqueue('https://boom', () => {
      throw new Error('sync boom')
    })
    await expect(boom).rejects.toThrow('sync boom')
    // 队列在同步抛错后仍可用
    await expect(q.enqueue('https://ok', async () => 1)).resolves.toBe(1)
  })

  it('activeUrl 反映正在执行的任务', async () => {
    const q = createRunQueue()
    expect(q.activeUrl()).toBeNull()
    const d = deferred<string>()
    const p = q.enqueue('https://cur', () => d.promise)
    expect(q.activeUrl()).toBe('https://cur')
    d.resolve('x')
    await p
    // finally 清 active 比外层 promise settle 晚一个微任务
    await new Promise((r) => setTimeout(r, 0))
    expect(q.activeUrl()).toBeNull()
  })
})
