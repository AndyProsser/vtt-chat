import { useCallback, useMemo, useState } from 'react'
import type { UUID } from '@shared'
import {
  appendJournalHashtagInput,
  buildContentHashtagSuggestions,
  buildHashtagFallbackSeed,
  buildHashtagSuggestions,
  collectJournalHashtags,
  getPendingJournalHashtag,
  parseJournalHashtags,
  serializeJournalHashtags,
} from '@/utils/journalPanel'

interface UseJournalHashtagsParams {
  sessionId: UUID
  sessionName: string | undefined
  draft: string
}

/** Manages all hashtag state and derived values for the journal editor. */
export function useJournalHashtags({ sessionId, sessionName, draft }: UseJournalHashtagsParams) {
  const [draftHashtagsInput, setDraftHashtagsInput] = useState('')

  const hashtagFallbackSeed = useMemo(() => buildHashtagFallbackSeed(sessionId), [sessionId])
  const hashtagSuggestions = useMemo(
    () => buildHashtagSuggestions(sessionName, sessionId),
    [sessionId, sessionName]
  )
  const contentHashtagSuggestions = useMemo(() => buildContentHashtagSuggestions(draft), [draft])

  const normalizedDraftHashtags = parseJournalHashtags(draftHashtagsInput, hashtagFallbackSeed)
  const normalizedDraftHashtagsValue = serializeJournalHashtags(normalizedDraftHashtags)

  const mergedHashtagSuggestions = useMemo(
    () =>
      [...contentHashtagSuggestions, ...hashtagSuggestions].filter(
        (tag, index, tags) => tags.indexOf(tag) === index
      ),
    [contentHashtagSuggestions, hashtagSuggestions]
  )

  const pendingHashtag = useMemo(
    () => getPendingJournalHashtag(draftHashtagsInput),
    [draftHashtagsInput]
  )
  const pendingHashtagQuery = useMemo(
    () => pendingHashtag.trim().replace(/^#+/, '').toLowerCase(),
    [pendingHashtag]
  )
  const autocompleteHashtagSuggestions = useMemo(() => {
    const committedTags = collectJournalHashtags(
      /\s$/.test(draftHashtagsInput)
        ? draftHashtagsInput.trim()
        : draftHashtagsInput.trimEnd().replace(/\S+$/, '').trim(),
      hashtagFallbackSeed
    )
    return mergedHashtagSuggestions
      .filter((tag) => !committedTags.includes(tag))
      .filter((tag) => (!pendingHashtagQuery ? true : tag.slice(1).includes(pendingHashtagQuery)))
      .slice(0, 6)
  }, [draftHashtagsInput, hashtagFallbackSeed, mergedHashtagSuggestions, pendingHashtagQuery])

  const applyJournalHashtag = useCallback(
    (rawTag: string) => {
      setDraftHashtagsInput(
        appendJournalHashtagInput(draftHashtagsInput, rawTag, hashtagFallbackSeed)
      )
    },
    [draftHashtagsInput, hashtagFallbackSeed]
  )

  const handleApplyTagHelp = useCallback(() => {
    const existingTags = collectJournalHashtags(draftHashtagsInput, hashtagFallbackSeed)
    const nextTags = [...contentHashtagSuggestions, ...hashtagSuggestions]
      .filter((tag, index, tags) => tags.indexOf(tag) === index)
      .filter((tag) => !existingTags.includes(tag))
      .slice(0, 4)

    if (nextTags.length === 0) return

    const mergedTags = nextTags.reduce(
      (currentValue, tag) => appendJournalHashtagInput(currentValue, tag, hashtagFallbackSeed),
      draftHashtagsInput
    )
    setDraftHashtagsInput(mergedTags)
  }, [contentHashtagSuggestions, draftHashtagsInput, hashtagFallbackSeed, hashtagSuggestions])

  const handleHashtagInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      const rawTag = pendingHashtag.trim()
      if (!rawTag) return
      event.preventDefault()
      applyJournalHashtag(rawTag)
    },
    [applyJournalHashtag, pendingHashtag]
  )

  return {
    draftHashtagsInput,
    setDraftHashtagsInput,
    normalizedDraftHashtags,
    normalizedDraftHashtagsValue,
    contentHashtagSuggestions,
    autocompleteHashtagSuggestions,
    applyJournalHashtag,
    handleApplyTagHelp,
    handleHashtagInputKeyDown,
  }
}
