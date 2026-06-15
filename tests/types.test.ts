import { describe, it, expect } from 'vitest'
import type {
  Difficulty,
  Mode,
  Temperature,
  Profile,
  Frontmatter,
  SessionMeta,
  TopicMeta,
  RecCard,
  NewTopic,
  UnsavedSession,
  Message,
  StateJson,
  IpcApi,
} from '../src/types'

describe('type instantiation', () => {
  it('Frontmatter accepts session_number and type', () => {
    const fm: Frontmatter = {
      title: 'Test',
      created: '2026-05-09T10:00:00Z',
      review_count: 0,
      difficulty: 'mid',
      tags: ['math'],
      session_number: 3,
      type: 'progress',
      progress_summary: 'learned calculus basics',
    }
    expect(fm.session_number).toBe(3)
    expect(fm.type).toBe('progress')
    expect(fm.progress_summary).toBe('learned calculus basics')
  })

  it('Frontmatter accepts description and DocType', () => {
    const fm: Frontmatter = {
      title: 'Test',
      description: 'A test description',
      created: '2026-05-09T10:00:00Z',
      review_count: 0,
      difficulty: 'mid',
      tags: ['math'],
      type: 'progress',
      session_number: 1,
    }
    expect(fm.description).toBe('A test description')
    expect(fm.type).toBe('progress')
  })

  it('Frontmatter works without new optional fields', () => {
    const fm: Frontmatter = {
      title: 'Minimal',
      created: '2026-05-09',
      review_count: 0,
      difficulty: 'low',
      tags: [],
    }
    expect(fm.title).toBe('Minimal')
  })

  it('SessionMeta can be instantiated', () => {
    const s: SessionMeta = {
      sessionNumber: 1,
      date: '2026-05-09',
      hasReport: true,
      hasTranscript: false,
      hasReview: false,
      hasFable: true,
      fableCount: 1,
      hasDiagram: false,
    }
    expect(s.sessionNumber).toBe(1)
    expect(s.fableCount).toBe(1)
  })

  it('TopicMeta can be instantiated with sessions array', () => {
    const session: SessionMeta = {
      sessionNumber: 1,
      date: '2026-05-09',
      hasReport: true,
      hasTranscript: false,
      hasReview: false,
      hasFable: false,
      fableCount: 0,
      hasDiagram: false,
    }
    const topic: TopicMeta = {
      dirName: 'calculus',
      title: 'Calculus',
      sessionCount: 1,
      sessions: [session],
      last_studied: '2026-05-09',
      last_studied_days: 0,
      groupId: 'default',
    }
    expect(topic.dirName).toBe('calculus')
    expect(topic.sessions).toHaveLength(1)
    expect(topic.sessionCount).toBe(1)
  })

  it('TopicMeta works with empty sessions', () => {
    const topic: TopicMeta = {
      dirName: 'empty-topic',
      title: 'Empty Topic',
      sessionCount: 0,
      sessions: [],
      last_studied: '2026-05-01',
      last_studied_days: 8,
      groupId: 'default',
    }
    expect(topic.sessions).toHaveLength(0)
  })

  it('StateJson does not have recommendation_cache', () => {
    const state: StateJson = {
      version: 1,
      profile: {
        name: 'Test',
        profile_text: '',
        preferred_topics: [],
      },
      lastUsed: { difficulty: 'mid', temperature: 0.7 },
      groupInspirations: {},
      ui: { session_count: 0 },
      fableStyleTags: [],
      lastFableTags: [],
      inspirationStrategy: 'v2',
      topicContinueSuggestions: {},
    }
    // @ts-expect-error recommendation_cache should not exist
    expect(state.recommendation_cache).toBeUndefined()
  })

  it('IpcApi scanLibrary returns TopicMeta[]', async () => {
    // Type-level check: mock implementation returns TopicMeta[]
    const mockScanLibrary: IpcApi['scanLibrary'] = async () => {
      const session: SessionMeta = {
        sessionNumber: 1,
        date: '2026-05-09',
        hasReport: true,
        hasTranscript: false,
        hasReview: false,
        hasFable: false,
        fableCount: 0,
        hasDiagram: false,
        hasFableImage: false,
      }
      return [
        {
          dirName: 'math',
          title: 'Math',
          sessionCount: 1,
          sessions: [session],
          last_studied: '2026-05-09',
          last_studied_days: 0,
          groupId: 'default',
        },
      ]
    }
    const result = await mockScanLibrary()
    expect(result[0].dirName).toBe('math')
    expect(result[0].sessions).toHaveLength(1)
  })

  it('IpcApi writeProgressMd accepts dirName and session_number', async () => {
    const mockWriteProgress: IpcApi['writeProgressMd'] = async (args) => {
      expect(args.dirName).toBe('math')
      expect(args.session_number).toBe(2)
      expect(args.progress_summary).toBe('summary')
      return { file_path: 'math/s2/学习报告.md' }
    }
    await mockWriteProgress({
      title: 'Report',
      body: 'Body',
      difficulty: 'mid',
      dirName: 'math',
      session_number: 2,
      progress_summary: 'summary',
    })
  })

  it('IpcApi writeProgressMd accepts description', async () => {
    const mockWrite: IpcApi['writeProgressMd'] = async (args) => {
      expect(args.description).toBe('desc')
      return { file_path: 'test.md' }
    }
    await mockWrite({
      title: 'Report',
      description: 'desc',
      body: 'Body',
      difficulty: 'mid',
      dirName: 'math',
      session_number: 1,
    })
  })

  it('IpcApi writeFable accepts correct args', async () => {
    const mockWrite: IpcApi['writeFable'] = async (args) => {
      expect(args.dirName).toBe('math')
      expect(args.sessionNumber).toBe(1)
      expect(args.title).toBe('Fable Title')
    }
    await mockWrite({
      dirName: 'math',
      sessionNumber: 1,
      title: 'Fable Title',
      body: 'fable body',
    })
  })

  it('IpcApi writeReviewReport accepts correct args', async () => {
    const mockWriteReview: IpcApi['writeReviewReport'] = async (args) => {
      expect(args.topic).toBe('Math')
      expect(args.dirName).toBe('math')
      expect(args.review_index).toBe(1)
    }
    await mockWriteReview({
      topic: 'Math',
      dirName: 'math',
      summary: 'good progress',
      gaps: ['needs practice'],
      review_index: 1,
    })
  })

  it('IpcApi writeTranscript accepts correct args', async () => {
    const mockWriteTranscript: IpcApi['writeTranscript'] = async (args) => {
      expect(args.dirName).toBe('math')
      expect(args.sessionNumber).toBe(1)
      expect(args.content).toBe('transcript content')
    }
    await mockWriteTranscript({
      dirName: 'math',
      sessionNumber: 1,
      content: 'transcript content',
    })
  })

  it('IpcApi readSessionFile accepts correct args', async () => {
    const mockReadSessionFile: IpcApi['readSessionFile'] = async (args) => {
      expect(args.dirName).toBe('math')
      expect(args.sessionNumber).toBe(1)
      expect(args.fileName).toBe('学习报告.md')
      return { content: 'file content', mimeType: 'text/markdown' }
    }
    const result = await mockReadSessionFile({
      dirName: 'math',
      sessionNumber: 1,
      fileName: '学习报告.md',
    })
    expect(result.content).toBe('file content')
  })

})
