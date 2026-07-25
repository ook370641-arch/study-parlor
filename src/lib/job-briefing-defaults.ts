import type { JobBriefingConfig, JobProfile } from '@shared/index'

export const DEFAULT_JOB_BRIEFING_CONFIG: JobBriefingConfig = {
  companies: [
    { name: '字节跳动', priority: 1, enabled: true },
    { name: '阿里巴巴', priority: 2, enabled: true },
    { name: '腾讯', priority: 3, enabled: true },
    { name: '百度', priority: 4, enabled: true },
    { name: '美团', priority: 5, enabled: true },
    { name: 'MiniMax', priority: 6, enabled: true },
    { name: '智谱AI', priority: 7, enabled: true },
    { name: '月之暗面', priority: 8, enabled: true },
    { name: '零一万物', priority: 9, enabled: true },
    { name: '百川智能', priority: 10, enabled: true },
  ],
  roleKeywords: ['AI产品经理', '大模型产品经理', 'Agent产品经理'],
  cities: ['北京', '上海', '杭州', '深圳'],
  skillKeywords: ['RAG', 'Agent', '提示词工程', '多模态'],
  eventSearchKeywords: [],
  jobSearchKeywords: [],
  searchInternship: false,
  searchFallRecruit: true,
}

export const DEFAULT_JOB_PROFILE: JobProfile = {
  targetRoles: [],
  direction: '',
  skills: [],
  experience: '',
  additionalNotes: '',
  updatedAt: '',
  keywordsGeneratedAt: '',
}

export function normalizeJobProfile(raw?: Partial<JobProfile>): JobProfile {
  return {
    targetRoles: Array.isArray(raw?.targetRoles) ? raw.targetRoles.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [],
    direction: typeof raw?.direction === 'string' ? raw.direction : '',
    skills: Array.isArray(raw?.skills) ? raw.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0) : [],
    experience: typeof raw?.experience === 'string' ? raw.experience : '',
    additionalNotes: typeof raw?.additionalNotes === 'string' ? raw.additionalNotes : '',
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
    keywordsGeneratedAt: typeof raw?.keywordsGeneratedAt === 'string' ? raw.keywordsGeneratedAt : '',
  }
}

export function isJobProfileEmpty(p: JobProfile): boolean {
  return p.targetRoles.length === 0 && !p.direction.trim() && !p.experience.trim()
}

export function formatJobProfile(profile: JobProfile): string {
  if (isJobProfileEmpty(profile)) return '（用户未提供个人背景，按通用 AI 产品求职者处理）'
  const lines = [
    `意向岗位: ${profile.targetRoles.join('、') || '未填写'}`,
    `方向: ${profile.direction || '未填写'}`,
    `技能: ${profile.skills.join('、') || '未填写'}`,
    `经历: ${profile.experience || '未填写'}`,
  ]
  if (profile.additionalNotes.trim()) lines.push(`补充: ${profile.additionalNotes}`)
  return lines.join('\n')
}
