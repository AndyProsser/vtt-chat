import { beforeAll, afterAll, vi } from 'vitest'

let debugSpy: ReturnType<typeof vi.spyOn>

beforeAll(() => {
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterAll(() => {
  debugSpy.mockRestore()
})
