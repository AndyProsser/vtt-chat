/**
 * MarkdownEditor
 *
 * Shared rich markdown editor used by Journal and Notes.
 *
 * Modes:
 *   - rich  (default): Tiptap ProseMirror-backed formatted surface
 *   - raw:  plain textarea showing raw markdown source
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

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { useEffect, useState, useCallback } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import '../../styles/components/notes/MarkdownEditor.css'

export type MarkdownEditorVariant = 'full' | 'restricted'

export interface MarkdownEditorProps {
  value: string
  onChange?: (markdown: string) => void
  placeholder?: string
  readOnly?: boolean
  variant?: MarkdownEditorVariant
  /** Additional className on the root element */
  className?: string
}

// Strips external http/https links from markdown while preserving display text.
// Internal links (note:// etc.) and plain content are untouched.
function stripExternalLinks(md: string): string {
  // Markdown link syntax: [text](url) → keep text, remove external url
  return md.replace(/\[([^\]]*)\]\((https?:\/\/[^)]*)\)/g, '$1')
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Start writing…',
  readOnly = false,
  variant = 'full',
  className,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'rich' | 'raw'>('rich')
  const [rawValue, setRawValue] = useState(value)

  const starterKitConfig =
    variant === 'restricted'
      ? {
          // Restricted: disable headings, code, blockquote, horizontal rule
          heading: false as const,
          code: false as const,
          codeBlock: false as const,
          blockquote: false as const,
          horizontalRule: false as const,
        }
      : {
          // Full: allow headings except h1 to discourage over-structuring
          heading: { levels: [2, 3, 4] } as const,
        }

  const editor = useEditor({
    extensions: [
      StarterKit.configure(starterKitConfig),
      Markdown.configure({
        html: false,
        linkify: false, // do not auto-convert URLs to links
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    content: value,
    editable: !readOnly && mode === 'rich',
    onUpdate: ({ editor: e }) => {
      if (readOnly || mode !== 'rich') return
      const md = stripExternalLinks(e.storage.markdown.getMarkdown())
      onChange?.(md)
    },
  })

  // Keep editor editable flag in sync with readOnly/mode
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!readOnly && mode === 'rich')
  }, [editor, readOnly, mode])

  // Sync incoming value changes into editor when in rich mode
  useEffect(() => {
    if (!editor || mode !== 'rich') return
    const currentMd = editor.storage.markdown.getMarkdown()
    if (currentMd !== value) {
      editor.commands.setContent(value, false)
    }
  }, [editor, value, mode])

  // When switching to raw mode, snapshot current markdown from editor
  const handleSwitchToRaw = useCallback(() => {
    if (editor) {
      setRawValue(editor.storage.markdown.getMarkdown())
    } else {
      setRawValue(value)
    }
    setMode('raw')
  }, [editor, value])

  // When switching back to rich mode, parse the raw textarea value
  const handleSwitchToRich = useCallback(() => {
    const sanitized = stripExternalLinks(rawValue)
    onChange?.(sanitized)
    if (editor) {
      editor.commands.setContent(sanitized, false)
    }
    setMode('rich')
  }, [editor, onChange, rawValue])

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const sanitized = stripExternalLinks(e.target.value)
    setRawValue(sanitized)
    onChange?.(sanitized)
  }

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor?.isActive(name, attrs) ?? false

  const toolbar = !readOnly && (
    <TooltipProvider delayDuration={140}>
      <div className="md-editor__toolbar" role="toolbar" aria-label="Formatting">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`md-editor__tool ${isActive('bold') ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                if (mode === 'rich') editor?.chain().focus().toggleBold().run()
              }}
              disabled={mode === 'raw'}
              aria-label="Bold"
              aria-pressed={isActive('bold')}
            >
              <strong>B</strong>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Bold</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`md-editor__tool ${isActive('italic') ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                if (mode === 'rich') editor?.chain().focus().toggleItalic().run()
              }}
              disabled={mode === 'raw'}
              aria-label="Italic"
              aria-pressed={isActive('italic')}
            >
              <em>I</em>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Italic</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`md-editor__tool ${isActive('bulletList') ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                if (mode === 'rich') editor?.chain().focus().toggleBulletList().run()
              }}
              disabled={mode === 'raw'}
              aria-label="Bullet list"
              aria-pressed={isActive('bulletList')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                format_list_bulleted
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Bullet list</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`md-editor__tool ${isActive('orderedList') ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                if (mode === 'rich') editor?.chain().focus().toggleOrderedList().run()
              }}
              disabled={mode === 'raw'}
              aria-label="Ordered list"
              aria-pressed={isActive('orderedList')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                format_list_numbered
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Ordered list</TooltipContent>
        </Tooltip>

        {variant === 'full' && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`md-editor__tool ${isActive('code') ? 'is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (mode === 'rich') editor?.chain().focus().toggleCode().run()
                  }}
                  disabled={mode === 'raw'}
                  aria-label="Inline code"
                  aria-pressed={isActive('code')}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    code
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Inline code</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`md-editor__tool ${isActive('blockquote') ? 'is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (mode === 'rich') editor?.chain().focus().toggleBlockquote().run()
                  }}
                  disabled={mode === 'raw'}
                  aria-label="Blockquote"
                  aria-pressed={isActive('blockquote')}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    format_quote
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Blockquote</TooltipContent>
            </Tooltip>
          </>
        )}

        <span className="md-editor__toolbar-sep" aria-hidden="true" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`md-editor__tool md-editor__tool--mode ${mode === 'raw' ? 'is-active' : ''}`}
              onClick={mode === 'rich' ? handleSwitchToRaw : handleSwitchToRich}
              aria-label={mode === 'rich' ? 'View raw markdown' : 'View formatted'}
              aria-pressed={mode === 'raw'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {mode === 'rich' ? 'code_blocks' : 'wysiwyg'}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {mode === 'rich' ? 'View raw markdown' : 'View formatted'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )

  const rootClass = [
    'md-editor',
    readOnly ? 'md-editor--readonly' : '',
    mode === 'raw' ? 'md-editor--raw' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass} data-testid="markdown-editor">
      {toolbar}

      {mode === 'rich' ? (
        <div className="md-editor__surface">
          <EditorContent
            editor={editor}
            className="md-editor__content"
            aria-placeholder={placeholder}
            aria-multiline="true"
          />
          {!value && !editor?.isFocused && (
            <span className="md-editor__placeholder" aria-hidden="true">
              {placeholder}
            </span>
          )}
        </div>
      ) : (
        <textarea
          className="md-editor__raw"
          value={rawValue}
          onChange={handleRawChange}
          placeholder={placeholder}
          readOnly={readOnly}
          rows={8}
          aria-label="Raw markdown source"
          spellCheck
        />
      )}
    </div>
  )
}
