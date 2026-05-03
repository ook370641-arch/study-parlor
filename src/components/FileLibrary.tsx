import { useStore } from '@/store'

export function FileLibrary() {
  const library = useStore(s => s.library)
  const openPreStudy = useStore(s => s.openPreStudy)

  if (library.length === 0) {
    return <div className="text-center text-parchment/40 font-sans text-sm py-8">学习库为空</div>
  }

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 py-6">
      {library.map(f => (
        <button key={f.file_path}
          onClick={() => openPreStudy({
            mode: f.last_studied ? 'review' : 'progress',
            topic: f.title,
            file_path: f.file_path
          })}
          className="text-parchment/70 hover:text-ember transition-colors font-serif">
          {f.title}
        </button>
      ))}
    </div>
  )
}
