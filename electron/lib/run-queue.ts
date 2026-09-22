/**
 * 串行执行队列：抓取窗口（anthropic-browser）全局只有一个隐藏 BrowserWindow，
 * 并发导入/抓取若同时 loadURL 会互相顶掉导航、监听器串台。所有窗口使用方
 * 经此队列 FIFO 串行；支持按 url 取消仍在等待的任务（运行中的任务由调用方
 * 通过窗口 stop + reject 取消，见 cancelCurrentOperation）。
 */

export interface RunQueue {
  /** 入队一个任务；返回的 Promise 在任务实际执行完毕后 settle */
  enqueue<T>(url: string, exec: () => Promise<T>): Promise<T>
  /** 取消仍在等待的任务（reject 'cancelled'）；url 缺省清空全部等待任务。返回取消数量 */
  cancelQueued(url?: string): number
  /** 正在执行的任务 url；空闲时为 null */
  activeUrl(): string | null
}

export function createRunQueue(): RunQueue {
  type Task = {
    url: string
    run: () => Promise<void>
    reject: (reason: Error) => void
  }
  let active: Task | null = null
  const waiting: Task[] = []

  const pump = () => {
    if (active) return
    const next = waiting.shift()
    if (!next) return
    active = next
    next.run().finally(() => {
      active = null
      pump()
    })
  }

  return {
    enqueue<T>(url: string, exec: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push({
          url,
          reject,
          // Promise.resolve().then 兜底 exec 同步抛错，统一走拒绝路径
          run: () => Promise.resolve().then(exec).then(resolve, reject),
        })
        pump()
      })
    },
    cancelQueued(url?: string): number {
      let n = 0
      for (let i = waiting.length - 1; i >= 0; i--) {
        if (!url || waiting[i].url === url) {
          waiting[i].reject(new Error('cancelled'))
          waiting.splice(i, 1)
          n++
        }
      }
      return n
    },
    activeUrl: () => active?.url ?? null,
  }
}
