import { useEditor, EditorContent } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import type { Level } from '@tiptap/extension-heading'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Fragment, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { DmdxInsertMenu } from './dmdx/DmdxInsertMenu'
import type { MarkdownEditorInsertAction, MarkdownEditorProps } from './MarkdownEditor'
import { Icon } from '@/components/ui/Icon'

const FULL_HEADING_LEVELS: Level[] = [2, 3, 4]

function stripExternalLinks(md: string): string {
  return md.replace(/(?<!!)\[([^\]]*)\]\((https?:\/\/[^)]*)\)/g, '$1')
}

interface MarkdownStorage {
  markdown?: { getMarkdown?: () => string }
}

function getEditorMarkdown(editor: unknown, fallback: string): string {
  const maybeEditor = editor as { storage?: MarkdownStorage } | null
  const markdown = maybeEditor?.storage?.markdown?.getMarkdown
  if (typeof markdown === 'function') return markdown()
  return fallback
}

function InsertActionDropdown({
  action,
  pendingId,
  onSelect,
}: {
  action: MarkdownEditorInsertAction
  pendingId: string | null
  onSelect: (child: MarkdownEditorInsertAction) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="md-editor__action-group" ref={ref}>
      <TooltipProvider delayDuration={140}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`md-editor__tool ${open ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                setOpen((prev) => !prev)
              }}
              disabled={Boolean(pendingId)}
              aria-label={action.label}
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {action.icon}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{action.label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && (
        <div className="md-editor__action-group-dropdown" role="listbox">
          {action.children!.map((child) => (
            <button
              key={child.id}
              type="button"
              role="option"
              aria-selected={false}
              className="md-editor__action-group-option"
              disabled={Boolean(pendingId)}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(child)
                setOpen(false)
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {child.icon}
              </span>
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function MarkdownEditorEditable({
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
            heading: false as const,
            code: false as const,
            codeBlock: false as const,
            blockquote: false as const,
            horizontalRule: false as const,
          }
        : { heading: { levels: FULL_HEADING_LEVELS } },
    [variant]
  )

  const extensions = useMemo(
    () => [
      StarterKit.configure(starterKitConfig),
      Image.configure({ allowBase64: true }),
      Markdown.configure({
        html: false,
        linkify: false,
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

  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) editor.destroy()
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(mode === 'rich')
  }, [editor, mode])

  useEffect(() => {
    if (!editor || mode !== 'rich') return
    const currentMd = getEditorMarkdown(editor, value)
    if (currentMd !== value) editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value, mode])

  const handleSwitchToRaw = useCallback(() => {
    setRawValue(editor ? getEditorMarkdown(editor, value) : value)
    setMode('raw')
  }, [editor, value])

  const handleSwitchToRich = useCallback(() => {
    const sanitized = stripExternalLinks(rawValue)
    onChange?.(sanitized)
    editor?.commands.setContent(sanitized, { emitUpdate: false })
    setMode('rich')
  }, [editor, onChange, rawValue])

  const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const sanitized = stripExternalLinks(e.target.value)
    setRawValue(sanitized)
    onChange?.(sanitized)
  }

  const handleInsertAction = useCallback(
    async (action: MarkdownEditorInsertAction) => {
      if (pendingInsertActionId) return
      setPendingInsertActionId(action.id)
      try {
        if (!action.onSelect) return
        const insertedText = (await action.onSelect(mode === 'raw' ? rawValue : value)).trim()
        if (!insertedText) return
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
          {variant === 'full' && <DmdxInsertMenu onInsert={handleInsertDmdxTemplate} />}
          <span className="md-editor__toolbar-sep" aria-hidden="true" />
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
                <Icon name="format_list_bulleted" />
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
                <Icon name="format_list_numbered" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Ordered list</TooltipContent>
          </Tooltip>
          {variant === 'full' && (
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
                  <Icon name="format_quote" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Blockquote</TooltipContent>
            </Tooltip>
          )}
          <span className="md-editor__toolbar-sep" aria-hidden="true" />
          {insertActions.map((action) => (
            <Fragment key={action.id}>
              {action.dividerBefore ? (
                <span className="md-editor__toolbar-sep" aria-hidden="true" />
              ) : null}
              {action.children ? (
                <InsertActionDropdown
                  action={action}
                  pendingId={pendingInsertActionId}
                  onSelect={(child) => void handleInsertAction(child)}
                />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="md-editor__tool"
                      onClick={() => void handleInsertAction(action)}
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
              )}
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
