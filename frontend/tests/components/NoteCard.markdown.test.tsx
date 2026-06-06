import { render, screen } from '@testing-library/react'
import { NoteVisibility } from '@shared'
import type { NoteEntity, UUID } from '@shared'
import { describe, expect, it, vi } from 'vitest'
import { NoteCard } from '../../src/components/workspaces/shared/panels/NotesPanel/NoteCard'

vi.mock('../../src/hooks/useToast', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('../../src/utils/notesImageInsertActions', () => ({
  createNotesImageInsertActions: () => [],
}))

const asUuid = (value: string) => value as UUID

const baseNote: NoteEntity = {
  id: asUuid('11111111-1111-4111-8111-111111111111'),
  campaignId: asUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ownerId: asUuid('22222222-2222-4222-8222-222222222222'),
  ownerUsername: 'Morgan',
  title: 'Forest Clue',
  content: 'The vines hide a marker.',
  visibility: NoteVisibility.CUSTOM,
  tags: ['#forest'],
  allowedUsers: [],
  attachments: [],
  publishedAt: null,
  createdAt: 10,
  updatedAt: 20,
}

describe('NoteCard markdown rendering', () => {
  it('re-renders embedded markdown images after note content updates', async () => {
    const { rerender } = render(
      <NoteCard
        campaignId={baseNote.campaignId!}
        note={baseNote}
        canEdit={true}
        canManageShare={true}
        canPublish={true}
        isPublishDisabled={false}
        shareUsers={[]}
        shareRooms={[]}
        publishRooms={[]}
        roomMemberIdsByRoomId={{}}
        onSave={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
        onPublish={vi.fn(async () => undefined)}
      />
    )

    const updatedNote: NoteEntity = {
      ...baseNote,
      content:
        '**Map fragment**\n\n![map](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)',
      attachments: [
        {
          id: asUuid('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
          campaignId: baseNote.campaignId,
          mime: 'image/jpeg',
          name: 'camp-map',
          uri: 'data:image/jpeg;base64,AAAA',
          createdAt: 22,
        },
      ],
      updatedAt: 21,
    }

    rerender(
      <NoteCard
        campaignId={baseNote.campaignId!}
        note={updatedNote}
        canEdit={true}
        canManageShare={true}
        canPublish={true}
        isPublishDisabled={false}
        shareUsers={[]}
        shareRooms={[]}
        publishRooms={[]}
        roomMemberIdsByRoomId={{}}
        onSave={vi.fn(async () => undefined)}
        onDelete={vi.fn(async () => undefined)}
        onPublish={vi.fn(async () => undefined)}
      />
    )

    expect(await screen.findByText('Map fragment')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'map' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'camp-map' })).toBeTruthy()
  })
})
