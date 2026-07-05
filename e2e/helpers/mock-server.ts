import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

export type MockRoute = {
  method?: string
  path: string | RegExp
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void | Promise<void>
}

export type MockServer = {
  url: string
  close: () => Promise<void>
  requests: Array<{ method: string; path: string; body: string }>
  clearRequests: () => void
}

export async function createMockServer(routes: MockRoute[]): Promise<MockServer> {
  const requests: MockServer['requests'] = []

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const path = req.url ?? '/'
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    await new Promise<void>((resolve) => req.on('end', resolve))
    const body = Buffer.concat(chunks).toString('utf8')
    if (process.env.E2E_DEBUG === '1') {
      console.log(`[mock-server] ${req.method} ${path}`)
    }
    requests.push({ method: req.method ?? 'GET', path, body })

    for (const route of routes) {
      const methodMatch = !route.method || route.method.toUpperCase() === (req.method ?? 'GET').toUpperCase()
      const pathMatch = typeof route.path === 'string' ? route.path === path : route.path.test(path)
      if (methodMatch && pathMatch) {
        await route.handler(req, res, body)
        return
      }
    }

    res.writeHead(404)
    res.end('not found')
  })

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        return reject(new Error('invalid server address'))
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((res, rej) => server.close(err => err ? rej(err) : res())),
        requests,
        clearRequests: () => { requests.length = 0 },
      })
    })
    server.on('error', reject)
  })
}

export function jsonResponse(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

export function textResponse(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, { 'Content-Type': 'text/plain' })
  res.end(text)
}
