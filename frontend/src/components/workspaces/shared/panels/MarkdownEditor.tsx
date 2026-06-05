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

import { useEditor, EditorContent } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import type { Level } from '@tiptap/extension-heading'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Fragment, useEffect, useState, useCallback, useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { DmdxMarkdownRenderer } from './dmdx/DmdxMarkdownRenderer'
import { DmdxInsertMenu } from './dmdx/DmdxInsertMenu'
import '@/styles/components/workspaces/shared/panels/MarkdownEditor.css'

interface MarkdownStorage {
  markdown?: {
    getMarkdown?: () => string
  }
}

const FULL_HEADING_LEVELS: Level[] = [2, 3, 4]

export type MarkdownEditorVariant = 'full' | 'restricted'

export interface MarkdownEditorInsertAction {
  id: string
  icon: string
  label: string
  dividerBefore?: boolean
  onSelect: (currentMarkdown: string) => string | Promise<string>
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

// Strips external http/https links from standard markdown links while preserving display text.
// Image markdown links are intentionally preserved so handouts can embed images.
function stripExternalLinks(md: string): string {
  // Markdown link syntax: [text](url) → keep text, remove external url
  return md.replace(/(?<!!)\[([^\]]*)\]\((https?:\/\/[^)]*)\)/g, '$1')
}

function getEditorMarkdown(editor: unknown, fallback: string): string {
  const maybeEditor = editor as { storage?: MarkdownStorage } | null
  const markdown = maybeEditor?.storage?.markdown?.getMarkdown
  if (typeof markdown === 'function') {
    return markdown()
  }

  return fallback
}

// ---------------------------------------------------------------------------
// MarkdownEditorEditable — edit-mode implementation with all hooks
// ---------------------------------------------------------------------------

function MarkdownEditorEditable({
  value,
  onChange,
  onBlur,
  placeholder = 'Start writing…',
  variant = 'full',
  insertActions = [],
  className,
}: Omit<MarkdownEditorProps, 'readOnly'>) {
  const [mode, setMode] = useState<'rich' | 'raw'>('rich')
  const [rawValue, setRawValue] = useState(value)
  const [pendingInsertActionId, setPendingInsertActionId] = useState<string | null>(null)

  const starterKitConfig = useMemo(
    () =>
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
            heading: { levels: FULL_HEADING_LEVELS },
          },
    [variant]
  )

  const extensions = useMemo(
    () => [
      StarterKit.configure(starterKitConfig),
      Image.configure({
        allowBase64: true,
      }),
      Markdown.configure({
        html: false,
        linkify: false, // do not auto-convert URLs to links
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    [starterKitConfig]
  )

  const editor = useEditor({
    extensions,
    content: value,
    editable: mode === 'rich',
    onUpdate: ({ editor: e }) => {
      if (mode !== 'rich') return
      const md = stripExternalLinks(getEditorMarkdown(e, value))
      onChange?.(md)
    },
  })

  // Defensive destroy: ensure ProseMirror state and plugins are released on unmount.
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.destroy()
      }
    }
  }, [editor])

  // Keep editor editable flag in sync with mode
  useEffect(() => {
    if (!editor) return
    editor.setEditable(mode === 'rich')
  }, [editor, mode])

  // Sync incoming value changes into editor when in rich mode
  useEffect(() => {
    if (!editor || mode !== 'rich') return
    const currentMd = getEditorMarkdown(editor, value)
    if (currentMd !== value) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, value, mode])

  // When switching to raw mode, snapshot current markdown from editor
  const handleSwitchToRaw = useCallback(() => {
    if (editor) {
      setRawValue(getEditorMarkdown(editor, value))
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
      editor.commands.setContent(sanitized, { emitUpdate: false })
    }
    setMode('rich')
  }, [editor, onChange, rawValue])

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const sanitized = stripExternalLinks(e.target.value)
    setRawValue(sanitized)
    onChange?.(sanitized)
  }

  const handleInsertAction = useCallback(
    async (action: MarkdownEditorInsertAction) => {
      if (pendingInsertActionId) {
        return
      }

      setPendingInsertActionId(action.id)

      try {
        const insertedText = (await action.onSelect(mode === 'raw' ? rawValue : value)).trim()
        if (!insertedText) {
          return
        }

        if (mode === 'raw') {
          const merged = [rawValue.trimEnd(), insertedText].filter(Boolean).join('\n\n')
          setRawValue(merged)
          onChange?.(merged)
          return
        }

        editor?.chain().focus().insertContent(insertedText).run()
      } finally {
        setPendingInsertActionId(null)
      }
    },
    [editor, mode, onChange, pendingInsertActionId, rawValue, value]
  )

  /** Inserts a DMDX block template at the cursor (or end) in either mode. */
  const handleInsertDmdxTemplate = useCallback(
    (template: string) => {
      const block = `\n${template}\n`
      if (mode === 'raw') {
        const merged = rawValue.trimEnd() + block
        setRawValue(merged)
        onChange?.(merged)
        return
      }
      editor?.chain().focus().insertContent(block).run()
    },
    [editor, mode, onChange, rawValue]
  )

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor?.isActive(name, attrs) ?? false

  const rootClass = ['md-editor', mode === 'raw' ? 'md-editor--raw' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass} data-testid="markdown-editor" onBlur={onBlur}>
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

          {/* DMDX Insert Block menu — available in full variant only */}
          {variant === 'full' && <DmdxInsertMenu onInsert={handleInsertDmdxTemplate} />}

          {insertActions.map((action) => (
            <Fragment key={action.id}>
              {action.dividerBefore ? (
                <span className="md-editor__toolbar-sep" aria-hidden="true" />
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="md-editor__tool"
                    onClick={() => {
                      void handleInsertAction(action)
                    }}
                    disabled={Boolean(pendingInsertActionId)}
                    aria-label={action.label}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {pendingInsertActionId === action.id ? 'hourglass_top' : action.icon}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{action.label}</TooltipContent>
              </Tooltip>
            </Fragment>
          ))}

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
          rows={8}
          aria-label="Raw markdown source"
          spellCheck
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MarkdownEditor — public API, switches between read-only and edit renderers
// ---------------------------------------------------------------------------

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
