import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Mock Worker API before importing App
const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }

  return { MockWorker }
})

vi.mock('../workers/sqlite.worker?worker', () => ({
  default: MockWorker,
}))

const { helpers } = vi.hoisted(() => ({
  helpers: {
    generateId: () => '00000000-0000-0000-0000-000000000000',
  },
}))

vi.mock('../workers/db-client', async (importOriginal) => {
  const mod = (await importOriginal()) as any
  return {
    ...mod,
    helpers,
  }
})

describe('App', () => {
  it.skip('mounts renders properly', async () => {
    const App = await import('../App.vue')
    const wrapper = mount(App.default)
    expect(wrapper.text()).toContain('You did it!')
  })
})
