import { useCallback, useEffect, useRef, useState } from 'react'
import type { Group, TopicMeta } from '@shared/index'
import { useStore } from '@/store'

export type StudyDragState = {
  topic: TopicMeta
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
}

function nearestGroupAt(x: number, y: number, groups: Group[]): { id: string; distance: number } | null {
  if (groups.length === 0) return null
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3
  return groups.map((group, index) => {
    const angle = (2 * Math.PI * index) / groups.length - Math.PI / 2
    const groupX = centerX + radius * Math.cos(angle)
    const groupY = centerY + radius * Math.sin(angle)
    return { id: group.id, distance: Math.hypot(x - groupX, y - groupY) }
  }).sort((a, b) => a.distance - b.distance)[0]
}

export function useStudyGravityDrag() {
  const groups = useStore(state => state.groups)
  const setGravityFieldOpen = useStore(state => state.setGravityFieldOpen)
  const setDraggingTopic = useStore(state => state.setDraggingTopic)
  const moveTopicToGroup = useStore(state => state.moveTopicToGroup)
  const showToast = useStore(state => state.showToast)
  const [dragState, setDragState] = useState<StudyDragState | null>(null)
  const dragStateRef = useRef(dragState)
  dragStateRef.current = dragState

  const cancel = useCallback(() => {
    dragStateRef.current = null
    setDragState(null)
    setGravityFieldOpen(false)
    setDraggingTopic(null)
  }, [setDraggingTopic, setGravityFieldOpen])

  useEffect(() => {
    if (!dragState) return
    const handleMouseMove = (event: MouseEvent) => {
      setDragState(previous => {
        if (!previous) return null
        const active = previous.active || Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 6
        if (active && !previous.active) {
          setGravityFieldOpen(true)
          setDraggingTopic(previous.topic)
        }
        return { ...previous, currentX: event.clientX, currentY: event.clientY, active }
      })
    }
    const handleMouseUp = (event: MouseEvent) => {
      const current = dragStateRef.current
      if (!current) return
      const nearest = current.active ? nearestGroupAt(event.clientX, event.clientY, groups) : null
      cancel()
      if (nearest && nearest.distance < 72) {
        void moveTopicToGroup(current.topic.dirName, nearest.id).catch(error => {
          showToast(`换组失败：${error instanceof Error ? error.message : String(error)}`)
        })
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', cancel)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', cancel)
    }
  }, [!!dragState, groups, moveTopicToGroup, showToast, setDraggingTopic, setGravityFieldOpen, cancel])

  const beginDrag = useCallback((topic: TopicMeta, startX: number, startY: number) => {
    window.getSelection()?.removeAllRanges()
    setDragState({ topic, startX, startY, currentX: startX, currentY: startY, active: false })
  }, [])

  return { dragState, beginDrag }
}
