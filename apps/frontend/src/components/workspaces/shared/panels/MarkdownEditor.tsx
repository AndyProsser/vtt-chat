/**
 * MarkdownEditor
 *
 * Shared rich markdown editor used by Journal and Notes.
 *
 * Modes:
 *   - rich  (default): Tiptap ProseMirror-backed formatted surface
 *   - raw:  plain textarea showing raw markdown source
 *
 * Read-only mode delegates to DmdxMarkdownRenderer, which renders DMDX fenced
 * blocks as structured cards. In edit mode, DMDX fences are editable code blocks
 * (per the v1 contract — no mandatory block builder).
 *
 * External links are always stripped from the output and blocked in the toolbar.
 * Internal note/attachment links are allowed.
 *
 * Variants:
 *   - 'full'       (default) – bold, italic, lists, code, blockquote
 *   - 'restricted' – bold, italic, bullet and ordered lists only
 *
 * Contract: value/onChange always carry markdown strings.
 */

import { DmdxMarkdownRenderer } from './dmdx/DmdxMarkdownRenderer'
import { MarkdownEditorEditable } from './MarkdownEditorEditable'
import '@/styles/components/workspaces/shared/panels/MarkdownEditor.css'

export type MarkdownEditorVariant = 'full' | 'restricted'

export interface MarkdownEditorInsertAction {
  id: string
  icon: string
  label: string
  dividerBefore?: boolean
  /** When present, the action renders as a dropdown containing these child actions. */
  children?: MarkdownEditorInsertAction[]
  onSelect?: (currentMarkdown: string) => string | Promise<string>
}

export interface MarkdownEditorProps {
  value: string
  onChange?: (markdown: string) => void
  onBlur?: (event: React.FocusEvent<HTMLDivElement>) => void
  placeholder?: string
  readOnly?: boolean
  variant?: MarkdownEditorVariant
  insertActions?: MarkdownEditorInsertAction[]
  /** Additional className on the root element */
  className?: string
}

export function MarkdownEditor({ readOnly = false, ...props }: MarkdownEditorProps) {
  if (readOnly) {
    return (
      <DmdxMarkdownRenderer
        value={props.value}
        placeholder={props.placeholder}
        className={props.className}
      />
    )
  }

  return <MarkdownEditorEditable {...props} />
}
