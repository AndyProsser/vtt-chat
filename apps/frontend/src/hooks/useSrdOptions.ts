/**
 * useSrdOptions
 * Fetches race, class, and subclass lists from the SRD proxy API.
 * Falls back to the static constant lists when the API is unreachable.
 * Subclass list re-fetches whenever the selected class changes.
 */

import { useEffect, useRef, useState } from 'react'
import { DND_5_5E_SRD_CLASSES, DND_5_5E_SRD_SPECIES } from '@/constants/characterSrd.constants'

type SrdRuleset = '2014' | '2024'

interface SrdOptionsState {
  raceOptions: string[]
  classOptions: string[]
  subclassOptions: string[]
  isLoading: boolean
}

interface UseSrdOptionsParams {
  apiUrl: string
  token: string
  ruleset: SrdRuleset
  selectedClass: string
}

const FALLBACK_RACES = DND_5_5E_SRD_SPECIES as unknown as string[]
const FALLBACK_CLASSES = DND_5_5E_SRD_CLASSES as unknown as string[]

async function fetchSrdList(url: string, token: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results: { index: string; name: string }[] }
    return (data.results ?? []).map((item) => item.name)
  } catch {
    return []
  }
}

export function useSrdOptions({
  apiUrl,
  token,
  ruleset,
  selectedClass,
}: UseSrdOptionsParams): SrdOptionsState {
  const [raceOptions, setRaceOptions] = useState<string[]>(FALLBACK_RACES)
  const [classOptions, setClassOptions] = useState<string[]>(FALLBACK_CLASSES)
  const [subclassOptions, setSubclassOptions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Fetch races and classes once when ruleset changes
  useEffect(() => {
    if (!apiUrl || !token) return

    let cancelled = false
    setIsLoading(true)

    Promise.all([
      fetchSrdList(`${apiUrl}/api/srd/races?ruleset=${ruleset}`, token),
      fetchSrdList(`${apiUrl}/api/srd/classes?ruleset=${ruleset}`, token),
    ]).then(([races, classes]) => {
      if (cancelled) return
      setRaceOptions(races.length > 0 ? races : FALLBACK_RACES)
      setClassOptions(classes.length > 0 ? classes : FALLBACK_CLASSES)
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [apiUrl, token, ruleset])

  // Fetch subclasses when selectedClass changes
  const prevClassRef = useRef<string>('')
  useEffect(() => {
    if (!apiUrl || !token || !selectedClass.trim()) {
      setSubclassOptions([])
      return
    }

    const classIndex = selectedClass.trim().toLowerCase().replace(/\s+/g, '-')
    if (classIndex === prevClassRef.current) return
    prevClassRef.current = classIndex

    let cancelled = false

    fetchSrdList(
      `${apiUrl}/api/srd/subclasses?class=${encodeURIComponent(classIndex)}&ruleset=${ruleset}`,
      token
    ).then((subclasses) => {
      if (!cancelled) setSubclassOptions(subclasses)
    })

    return () => {
      cancelled = true
    }
  }, [apiUrl, token, ruleset, selectedClass])

  return { raceOptions, classOptions, subclassOptions, isLoading }
}
