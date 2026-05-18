import { beforeAll, afterAll, vi } from 'vitest'

let debugSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
})

beforeAll(() => {
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  const originalError = console.error.bind(console)
  errorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((...args: Parameters<typeof console.error>) => {
      const [firstArg] = args
      if (
        typeof firstArg === 'string' &&
        (firstArg.startsWith('[useLiveKit] Token fetch failed:') ||
          firstArg.startsWith('[useLiveKit] Connection failed:'))
      ) {
        return
      }

      originalError(...args)
    })
})

afterAll(() => {
  debugSpy.mockRestore()
  errorSpy.mockRestore()
})
