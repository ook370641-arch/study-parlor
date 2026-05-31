import { useState, useRef, useEffect } from 'react'

interface Props {
  open: boolean
  tags: string[]
  defaultSelected: string[]
  onClose: () => void
  onConfirm: (selectedTags: string[], description: string) => void
}

export function FableStyleDialog({ open, tags, defaultSelected, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [description, setDescription] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [localTags, setLocalTags] = useState(tags)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSelected(new Set(defaultSelected))
      setDescription('')
      setLocalTags(tags)
    }
  }, [open, tags, defaultSelected])

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAdding])

  if (!open) return null

  const toggleTag = (tag: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const removeTag = (tag: string) => {
    setLocalTags(prev => prev.filter(t => t !== tag))
    setSelected(prev => {
      const next = new Set(prev)
      next.delete(tag)
      return next
    })
  }

  const confirmAddTag = () => {
    const trimmed = newTag.trim()
    if (trimmed && !localTags.includes(trimmed)) {
      setLocalTags(prev => [...prev, trimmed])
      setSelected(prev => new Set(prev).add(trimmed))
    }
    setNewTag('')
    setIsAdding(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmAddTag()
    if (e.key === 'Escape') {
      setNewTag('')
      setIsAdding(false)
    }
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selected), description.trim())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-ink/95 border border-slate/25 rounded-lg p-5 w-full max-w-md mx-4 shadow-2xl"
        style={{ backdropFilter: 'blur(12px)' }}
      >
        <h3 className="text-sm text-parchment font-medium mb-1">✨ 为这则寓言注入你的意图</h3>
        <p className="text-[11px] text-parchment/40 mb-4">选择风格标签，或写下你自己的想法</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {localTags.map(tag => (
            <span
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`relative group px-2.5 py-1 text-[11px] rounded-full border cursor-pointer transition-colors ${
                selected.has(tag)
                  ? 'border-ember/50 text-ember bg-ember/10'
                  : 'border-slate/20 text-parchment/60 hover:border-slate/40'
              }`}
            >
              {tag}
              <span
                onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                className="hidden group-hover:inline ml-1 text-parchment/30 hover:text-wine cursor-pointer"
              >
                ✕
              </span>
            </span>
          ))}

          {isAdding ? (
            <input
              ref={inputRef}
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (newTag.trim()) confirmAddTag()
                else setIsAdding(false)
              }}
              placeholder="新标签..."
              className="px-2.5 py-1 text-[11px] rounded-full border border-ember/30 bg-ink text-parchment outline-none w-20"
            />
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="px-2.5 py-1 text-[11px] rounded-full border border-dashed border-slate/20 text-parchment/40 hover:border-slate/40 hover:text-parchment/60 transition-colors"
            >
              +
            </button>
          )}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="补充你的想法（可选）...&#10;如：主角是一位老档案管理员，背景是一座不断丢失数据的图书馆"
          className="w-full min-h-[72px] bg-ink/60 border border-slate/20 rounded-md px-3 py-2 text-[11px] text-parchment placeholder:text-parchment/20 outline-none resize-y"
          style={{ scrollbarColor: 'rgba(148,163,184,0.3) transparent', scrollbarWidth: 'thin' }}
        />
        <p className="text-[10px] text-parchment/25 mt-1.5">
          这些描述将作为提示词与学习内容一同交给 AI
        </p>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] rounded border border-slate/20 text-parchment/50 hover:border-slate/40 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-[11px] rounded border border-ember/40 text-ember bg-ember/10 hover:bg-ember/20 transition-colors"
          >
            开始书写
          </button>
        </div>
      </div>
    </div>
  )
}
