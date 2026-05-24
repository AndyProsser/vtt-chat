import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NoteVisibility } from '@shared'
import type { NoteEntity, UUID } from '@shared'
import { describe, expect, it, vi } from 'vitest'
import { NoteCard } from '../../src/components/workspaces/shared/panels/NotesPanel/NoteCard'

vi.mock('../../src/components/workspaces/shared/panels/MarkdownEditor', () => ({
  MarkdownEditor: ({ value, onChange, readOnly }: any) =>
    readOnly ? (
      <div data-testid="markdown-editor-readonly">{value}</div>
    ) : (
      <textarea
        aria-label="Markdown editor"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    ),
}))

vi.mock('../../src/components/workspaces/shared/panels/NotesPanel/NoteSharePopover', () => ({
  NoteSharePopover: ({ open, trigger }: any) => (
    <div>
      {trigger}
      <div data-testid="share-popover-state">{open ? 'open' : 'closed'}</div>
    </div>
  ),
}))

vi.mock('../../src/hooks/useToast', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('../../src/utils/notesImageInsertActions', () => ({
  createNotesImageInsertActions: () => [],
}))

const asUuid = (value: string) => value as UUID

const note: NoteEntity = {
  id: asUuid('11111111-1111-4111-8111-111111111111'),
  ownerId: asUuid('22222222-2222-4222-8222-222222222222'),
  ownerUsername: 'Morgan',
  title: 'Forest Clue',
  content: 'The vines hide a marker.',
  visibility: NoteVisibility.CUSTOM,
  tags: ['#forest'],
  allowedUsers: [],
  publishedAt: null,
  createdAt: 10,
  updatedAt: 20,
}

describe('NoteCard', () => {
  it('normalizes hashtags on save', async () => {
    const onSave = vi.fn(async () => undefined)

    render(
      <NoteCard
        note={note}
        canEdit={true}
        canManageShare={true}
        canPublish={true}
        shareUsers={[]}
        shareRooms={[]}
        roomMemberIdsByRoomId={{}}
        onSave={onSave}
        onDelete={vi.fn(async () => undefined)}
        onPublish={vi.fn(async () => undefined)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'Updated clue' } })
    fireEvent.change(screen.getByLabelText('Markdown editor'), {
      target: { value: 'Fresh notes' },
    })
    fireEvent.change(screen.getByLabelText('Hashtags'), {
      target: { value: 'NPC clue, ##Forest Path, #npc clue' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save handout' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        note.id,
        expect.objectContaining({
          title: 'Updated clue',
          content: 'Fresh notes',
          tags: ['#npc-clue', '#forest-path'],
          allowedUsers: [],
        })
      )
    })
  })

  it('opens share editing from view mode for DMs', async () => {
    render(
      <NoteCard
        note={note}
        canEdit={true}
        canManageShare={true}
        canPublish={true}
        shareUsers={[]}
        shareRooms={[]}
        roomMemberIdsByRoomId={{}}
        onSave={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
        onPublish={vi.fn(async () => undefined)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Note title')).toBeTruthy()
      expect(screen.getByTestId('share-popover-state').textContent).toBe('open')
    })
  })
})
