import type { DragEvent, ReactNode } from 'react'
import type { BlogMineGroup } from '@shared/index'
import { AlbumGroupSection } from '@/components/album-wall/AlbumGroupSection'

interface Props {
  area: 'list' | 'wall'
  group: BlogMineGroup
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  onGroupDragStart: (event: DragEvent<HTMLElement>) => void
  onGroupDragOver: (event: DragEvent<HTMLElement>) => void
  onGroupDrop: (event: DragEvent<HTMLElement>) => void
  recommendationTools?: ReactNode
  children: ReactNode
}

export function BlogMineGroupSection({
  area,
  group,
  label,
  count,
  collapsed,
  onToggle,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDrop,
  recommendationTools,
  children,
}: Props) {
  return (
    <AlbumGroupSection
      groupKey={group}
      testIdPrefix={area}
      label={label}
      count={count}
      collapsed={collapsed}
      onToggle={onToggle}
      headerClassName="text-lg"
      draggable
      onGroupDragStart={onGroupDragStart}
      onGroupDragOver={onGroupDragOver}
      onGroupDrop={onGroupDrop}
    >
      {recommendationTools}
      {children}
    </AlbumGroupSection>
  )
}
