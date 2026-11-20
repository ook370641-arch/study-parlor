import { useRef, useState } from 'react'
import { useStore } from '@/store'
import { ExternalSummaryContent } from '@/components/ExternalSummaryContent'
import { STUDY_FONT_STYLES, normalizeStudyFontSize } from '@/lib/study-font-size'
import { DemoInfoButton, DemoNotePopover } from '@/components/demo/DemoNotePopover'
import type { DemoNote } from '@/lib/demo-notes'

export function ExternalSummaryWorkspace() {
  const theme = useStore(state => state.briefingTheme)
  const fontSize = useStore(state => state.studyFontSize)
  const materials = useStore(state => state.externalMaterials)
  const infoRef = useRef<HTMLSpanElement>(null)
  const [openNote, setOpenNote] = useState<DemoNote['id'] | null>(null)
  const isAcademic = theme !== 'newspaper'

  return (
    <section data-testid="external-summary-workspace" className={`relative z-[5] min-h-0 flex-1 overflow-y-auto px-8 py-4 ${isAcademic ? 'text-parchment/80' : 'text-[#1a1a1a]'}`} style={{ fontSize: STUDY_FONT_STYLES[normalizeStudyFontSize(fontSize)] }}>
      <div className="mx-auto max-w-4xl lg:max-w-6xl">
        <div className="flex justify-end"><span ref={infoRef} className="contents"><DemoInfoButton noteId="external-materials" testId="demo-info-external-materials" size="icon" label="这些外部资料是怎么找来的" theme={theme} active={openNote === 'external-materials'} onClick={() => setOpenNote(value => value ? null : 'external-materials')} /></span></div>
        {materials?.summary ? <ExternalSummaryContent summary={materials.summary} sources={materials.sources} theme={theme} /> : <div className="italic opacity-50">暂无摘要</div>}
      </div>
      <DemoNotePopover noteId={openNote} anchorRef={infoRef} onClose={() => setOpenNote(null)} theme={theme} />
    </section>
  )
}
