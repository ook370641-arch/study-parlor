import { useStore } from '@/store'

export function WritingBoard() {
  const file = useStore(s => s.writingFile)

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-parchment/40 text-sm">
        选择一篇文章开始写作，或点击 ＋ 新建
      </div>
    )
  }

  return (
    <div className="p-8 text-parchment/60">
      编辑器将在 Task 7 实现（当前文件: {file.path}）
    </div>
  )
}
