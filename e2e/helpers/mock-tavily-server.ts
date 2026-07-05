import http from 'node:http'

export function startMockTavilyServer(port: number): http.Server {
  return http.createServer((req, res) => {
    if (req.url?.includes('search')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ results: [] }))
    } else {
      res.writeHead(500)
      res.end('{"error":"not found"}')
    }
  }).listen(port)
}
