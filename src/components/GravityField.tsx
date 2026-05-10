import { useMemo } from 'react'
import type { Group, TopicMeta } from '@shared/index'

interface GravityFieldProps {
  groups: Group[]
  topics: TopicMeta[]
  draggingTopic: TopicMeta | null
  dragPosition: { x: number; y: number } | null
  containerWidth: number
  containerHeight: number
}

export function GravityField({
  groups,
  topics,
  draggingTopic,
  dragPosition,
  containerWidth,
  containerHeight,
}: GravityFieldProps) {
  const centers = useMemo(() => {
    const count = groups.length
    if (count === 0) return []

    const cx = containerWidth / 2
    const cy = containerHeight / 2
    const radius = Math.min(containerWidth, containerHeight) * 0.3

    return groups.map((group, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      return {
        group,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      }
    })
  }, [groups, containerWidth, containerHeight])

  // Position each topic around its group's gravity center
  const topicNodes = useMemo(() => {
    if (centers.length === 0) return []

    // Build map: groupId -> center
    const centerMap = new Map(centers.map((c) => [c.group.id, c]))

    // Count topics per group to spread them out
    const groupTopicCounts = new Map<string, number>()
    for (const t of topics) {
      groupTopicCounts.set(t.groupId, (groupTopicCounts.get(t.groupId) || 0) + 1)
    }
    const groupTopicIndices = new Map<string, number>()

    return topics.map((topic) => {
      const center = centerMap.get(topic.groupId)
      if (!center) {
        // Fallback: random position if no center for this group
        return { topic, x: containerWidth / 2, y: containerHeight / 2 }
      }

      const count = groupTopicCounts.get(topic.groupId) || 1
      const idx = groupTopicIndices.get(topic.groupId) || 0
      groupTopicIndices.set(topic.groupId, idx + 1)

      // Spread topics in an arc around the center
      const spreadAngle = Math.min(Math.PI * 0.8, (Math.PI * 0.3) * count)
      const baseAngle = -Math.PI / 2
      const angleStep = count > 1 ? spreadAngle / (count - 1) : 0
      const angle = baseAngle - spreadAngle / 2 + angleStep * idx

      // Orbit radius varies slightly
      const orbitRadius = 80 + (idx % 3) * 20

      return {
        topic,
        x: center.x + orbitRadius * Math.cos(angle),
        y: center.y + orbitRadius * Math.sin(angle),
      }
    })
  }, [topics, centers, containerWidth, containerHeight])

  if (!draggingTopic || !dragPosition) return null

  const dragX = dragPosition.x
  const dragY = dragPosition.y

  return (
    <div
      className="absolute inset-0 z-20 pointer-events-none"
      style={{ background: 'rgba(26, 21, 18, 0.85)' }}
    >
      {/* SVG magnetic lines */}
      <svg className="absolute inset-0 w-full h-full">
        {centers.map((center) => {
          const dist = Math.hypot(dragX - center.x, dragY - center.y)
          const maxDist = Math.max(containerWidth, containerHeight)
          const opacity = Math.max(0.1, 1 - dist / maxDist) * 0.6
          return (
            <line
              key={center.group.id}
              x1={dragX}
              y1={dragY}
              x2={center.x}
              y2={center.y}
              stroke={center.group.color}
              strokeWidth={1.5}
              strokeDasharray="4,4"
              opacity={opacity}
            />
          )
        })}
      </svg>

      {/* Gravity centers */}
      {centers.map((center) => (
        <div
          key={center.group.id}
          className="absolute flex items-center justify-center rounded-full"
          style={{
            left: center.x - 24,
            top: center.y - 24,
            width: 48,
            height: 48,
            backgroundColor: center.group.color + '20',
            border: `2px solid ${center.group.color}`,
            boxShadow: `0 0 12px ${center.group.color}40, 0 0 24px ${center.group.color}20`,
          }}
        >
          <span
            className="text-[10px] font-sans font-medium"
            style={{ color: center.group.color }}
          >
            {center.group.name}
          </span>
        </div>
      ))}

      {/* Static topic nodes — positioned around their group's center */}
      {topicNodes
        .filter((n) => n.topic.dirName !== draggingTopic.dirName)
        .map((node) => (
          <div
            key={node.topic.dirName}
            className="absolute px-2 py-1 rounded text-[11px] font-serif text-parchment/70"
            style={{
              left: node.x - 30,
              top: node.y - 10,
              background: 'rgba(26, 21, 18, 0.8)',
              opacity: 0.85,
              border: '1px solid rgba(232, 213, 183, 0.1)',
              maxWidth: 80,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.topic.title}
          </div>
        ))}

      {/* Dragging topic node */}
      <div
        className="absolute px-3 py-1.5 rounded-lg text-xs font-serif text-parchment border-2 z-30"
        style={{
          left: dragX - 40,
          top: dragY - 14,
          background: 'rgba(26, 21, 18, 0.95)',
          borderColor: centers.find(
            (c) => c.group.id === draggingTopic.groupId
          )?.group.color,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          transform: 'scale(1.1)',
        }}
      >
        {draggingTopic.title.slice(0, 12)}
      </div>
    </div>
  )
}
