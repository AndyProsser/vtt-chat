/**
 * DmdxMarkdownRenderer
 *
 * Read-only markdown renderer that understands DMDX fenced blocks.
 * Splits the markdown string into plain-markdown segments and DMDX-block
 * segments, rendering each with the appropriate component.
 *
 * Plain markdown segments are rendered via a lightweight Tiptap read-only
 * editor instance so formatting (bold, lists, headings, code) is preserved.
 */

import { useEditor, EditorContent } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { useEffect, useMemo } from 'react'
import { splitMarkdownSegments } from '@/utils/dmdx/dmdxParser'
import { DmdxBlock } from './DmdxBlock'
import '@/styles/components/workspaces/shared/panels/DmdxBlocks.css'

interface MarkdownSegmentViewProps {
  text: string
  placeholder?: string
}

function getEditorMarkdown(editor: unknown): string {
  const e = editor as { storage?: { markdown?: { getMarkdown?: () => string } } } | null
  return e?.storage?.markdown?.getMarkdown?.() ?? ''
}

function MarkdownSegmentView({ text, placeholder }: MarkdownSegmentViewProps) {
  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Image.configure({ allowBase64: true }),
      Markdown.configure({ html: false, linkify: false }),
    ],
    []
  )

  const editor = useEditor({
    extensions,
    content: text,
    editable: false,
    // Defer editor creation to after mount so isComponentMounted=true before
    // scheduleDestroy fires — prevents the destroy/recreate loop in virtual lists.
    immediatelyRender: false,
  })

  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) editor.destroy()
    }
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    // Guard matches MarkdownEditorEditable: only call setContent when the
    // markdown has actually changed, to avoid a spurious ProseMirror transaction
    // on mount that causes PureEditorContent to loop via forceUpdate().
    if (getEditorMarkdown(editor) !== text) {
      editor.commands.setContent(text, { emitUpdate: false })
    }
  }, [editor, text])

  if (!text.trim() && placeholder) {
    return <span className="md-editor__placeholder">{placeholder}</span>
  }

  return (
    <EditorContent
      editor={editor}
      className="md-editor__content"
      aria-multiline="true"
      aria-readonly="true"
    />
  )
}

interface DmdxMarkdownRendererProps {
  value: string
  placeholder?: string
  className?: string
}

export function DmdxMarkdownRenderer({ value, placeholder, className }: DmdxMarkdownRendererProps) {
  const segments = useMemo(() => splitMarkdownSegments(value), [value])

  const isEmpty = !value.trim()

  return (
    <div className={`md-editor md-editor--readonly dmdx-renderer ${className ?? ''}`}>
      <div className="md-editor__surface">
        {isEmpty && placeholder ? (
          <span className="md-editor__placeholder" aria-hidden="true">
            {placeholder}
          </span>
        ) : (
          segments.map((segment, index) =>
            segment.kind === 'dmdx' ? (
              <DmdxBlock
                key={index}
                blockType={segment.blockType}
                id={segment.id}
                rawContent={segment.rawContent}
                parsed={segment.parsed}
              />
            ) : (
              <MarkdownSegmentView
                key={index}
                text={segment.text}
                placeholder={index === 0 ? placeholder : undefined}
              />
            )
          )
        )}
      </div>
    </div>
  )
}
