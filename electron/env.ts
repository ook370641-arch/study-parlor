import fs from 'node:fs'
import path from 'node:path'

export type AppConfig = {
  apiKey: string
  baseUrl: string
  model: string
  libraryPath: string
}

const DEFAULT_MODEL = 'kimi-k2.6'

function normalizeBaseUrl(url: string): string {
  let normalized = url.replace(/\/+$/, '')
  if (!normalized.endsWith('/v1')) normalized += '/v1'
  return normalized
}

function sanitizeModel(model: string): string {
  // Strip actual ANSI escape sequences (e.g. \x1b[1m) if somehow present
  const noAnsi = model.replace(/\x1b\[[0-9;]*m/g, '')
  const cleaned = noAnsi.trim()
  // Reject bracket artifacts like [1m] and control characters that commonly
  // get copied from terminal output into .env
  if (/[\[\]\x00-\x1f\x7f]/.test(cleaned)) {
    throw new Error(
      `KIMI_MODEL 包含非法字符: "${cleaned}"。请检查是否从终端复制时带入了 ANSI 转义字符（如 [1m]）。`
    )
  }
  return cleaned
}

export function loadEnv(env: Record<string, string | undefined>): AppConfig {
  const apiKey = env.KIMI_API_KEY?.trim()
  const PLACEHOLDERS = ['sk-kimi-replace-me', 'sk-kimi-...', 'your-api-key']
  if (!apiKey || PLACEHOLDERS.includes(apiKey)) {
    throw new Error('KIMI_API_KEY 未配置或仍是占位符。请编辑 .env 文件，将其替换为你的真实 API Key。')
  }

  const libraryPath = env.STUDY_LIBRARY_PATH?.trim()
  if (!libraryPath) throw new Error('Missing STUDY_LIBRARY_PATH in .env')

  const baseUrl = normalizeBaseUrl(env.KIMI_BASE_URL?.trim() || 'https://api.kimi.com/coding/v1')

  return {
    apiKey,
    baseUrl,
    model: sanitizeModel(env.KIMI_MODEL?.trim() || DEFAULT_MODEL),
    libraryPath
  }
}

function getEnvPath(): string {
  return path.join(process.cwd(), '.env')
}

export function saveEnv(config: AppConfig): void {
  const model = sanitizeModel(config.model.trim() || DEFAULT_MODEL)
  const baseUrl = normalizeBaseUrl(config.baseUrl.trim() || 'https://api.kimi.com/coding/v1')

  const envPath = getEnvPath()
  let content = ''
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf-8')
  }

  const lines = content.split(/\r?\n/)
  const keys = [
    { key: 'KIMI_API_KEY', value: config.apiKey.trim() },
    { key: 'KIMI_BASE_URL', value: baseUrl },
    { key: 'KIMI_MODEL', value: model },
    { key: 'STUDY_LIBRARY_PATH', value: config.libraryPath.trim() },
  ]

  const updated = new Set<string>()
  const newLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_]+)=/)
    if (!match) return line
    const entry = keys.find((k) => k.key === match[1])
    if (!entry) return line
    updated.add(entry.key)
    return `${entry.key}=${entry.value}`
  })

  for (const entry of keys) {
    if (!updated.has(entry.key)) {
      newLines.push(`${entry.key}=${entry.value}`)
    }
  }

  fs.writeFileSync(envPath, newLines.join('\n') + '\n')
}
