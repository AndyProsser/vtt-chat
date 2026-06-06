import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UUID } from '@shared'
import { fetchSessionNotesOnce } from '../../src/utils/notesFetch'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const NOTE_ID = '22222222-2222-4222-8222-222222222222' as UUID
const USER_ID = '33333333-3333-4333-8333-333333333333' as UUID
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444' as UUID

function makeFetchResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

describe('fetchSessionNotesOnce', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps API notes into frontend notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeFetchResponse({
          notes: [
            {
              id: NOTE_ID,
              authorId: USER_ID,
              authorUsername: 'alice',
              title: 'Plan',
              content: 'Secret',
              visibility: 'PRIVATE',
              tags: undefined,
              allowedUsers: [USER_ID],
              attachments: [
                {
                  id: ATTACHMENT_ID,
                  campaignId: '55555555-5555-4555-8555-555555555555',
                  mime: 'image/jpeg',
                  name: 'map-fragment',
                  uri: 'data:image/jpeg;base64,AAAA',
                  createdAt: 3,
                },
              ],
              publishedAt: null,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        })
      )
    )

    const notes = await fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token')

    expect(notes).toEqual([
      {
        id: NOTE_ID,
        ownerId: USER_ID,
        ownerUsername: 'alice',
        title: 'Plan',
        content: 'Secret',
        visibility: 'PRIVATE',
        tags: [],
        allowedUsers: [USER_ID],
        attachments: [
          {
            id: ATTACHMENT_ID,
            campaignId: '55555555-5555-4555-8555-555555555555',
            mime: 'image/jpeg',
            name: 'map-fragment',
            uri: 'data:image/jpeg;base64,AAAA',
            createdAt: 3,
          },
        ],
        publishedAt: undefined,
        createdAt: 1,
        updatedAt: 2,
      },
    ])
  })

  it('deduplicates concurrent in-flight requests for the same key', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const promiseA = fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token')
    const promiseB = fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch?.(makeFetchResponse({ notes: [] }))

    await expect(promiseA).resolves.toEqual([])
    await expect(promiseB).resolves.toEqual([])
  })

  it('does not deduplicate requests with different keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeFetchResponse({ notes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token-a')
    await fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token-b')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws the API message when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse({ message: 'No access' }, false, 403))
    )

    await expect(fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token')).rejects.toThrow(
      'No access'
    )
  })

  it('falls back to HTTP status when an error response body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error('bad json')),
      })
    )

    await expect(fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token')).rejects.toThrow(
      'HTTP 500'
    )
  })

  it('clears the in-flight request after a failure so a later retry can proceed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeFetchResponse({ message: 'No access' }, false, 403))
      .mockResolvedValueOnce(makeFetchResponse({ notes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token')).rejects.toThrow()
    await expect(fetchSessionNotesOnce('http://api.test', SESSION_ID, 'token')).resolves.toEqual([])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
