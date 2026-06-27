import { useStore } from '@/store'
import { DEFAULT_TERMINOLOGY } from './terminology-defaults'
import type { Terminology } from '@shared/index'

export function getTerminology(custom: Terminology | undefined): Required<Terminology> {
  return { ...DEFAULT_TERMINOLOGY, ...(custom ?? {}) }
}

export function useTerminology(): Required<Terminology> {
  const custom = useStore(s => s.terminology)
  return getTerminology(custom)
}
