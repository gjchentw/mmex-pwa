import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { Quasar, QLayout, QPageContainer } from 'quasar'
import HomePage from '../pages/HomePage.vue'
import { registerSummaryCard, resetSummaryCards } from '../components/home/summary-cards'

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      home: {
        title: 'Overview',
        emptyTitle: 'Your database is ready',
        emptyBody: 'Nothing to summarize yet.',
      },
    },
  },
})

// QPage refuses to render outside a layout, so the harness supplies the same
// container the application shell provides.
const Harness = defineComponent({
  render: () => h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(HomePage))),
})

const mountHome = () => mount(Harness, { global: { plugins: [i18n, Quasar] } })

/** Spec: app-shell-navigation, requirement "Home Summary Surface". */
describe('HomePage', () => {
  beforeEach(() => {
    resetSummaryCards()
  })

  afterEach(() => {
    resetSummaryCards()
  })

  // Scenario "The home explains itself before any card exists".
  it('presents the empty state when no card is registered', () => {
    const wrapper = mountHome()

    expect(wrapper.find('[data-testid="home-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-cards"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Your database is ready')
    expect(wrapper.text()).toContain('Nothing to summarize yet.')
  })

  // A later phase contributes a card without the home being modified
  // (design.md D2).
  it('renders a registered card without the page being changed', async () => {
    registerSummaryCard({
      id: 'test-card',
      order: 10,
      component: defineComponent({ render: () => h('div', 'Net worth card') }),
    })

    const wrapper = mountHome()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="home-cards"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-empty"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Net worth card')
  })

  it('orders cards by their declared order', async () => {
    registerSummaryCard({
      id: 'second',
      order: 20,
      component: defineComponent({ render: () => h('div', 'SECOND') }),
    })
    registerSummaryCard({
      id: 'first',
      order: 10,
      component: defineComponent({ render: () => h('div', 'FIRST') }),
    })

    const wrapper = mountHome()
    await wrapper.vm.$nextTick()

    const text = wrapper.text()
    expect(text.indexOf('FIRST')).toBeLessThan(text.indexOf('SECOND'))
  })

  it('replaces a card registered twice under the same identity', async () => {
    const card = (label: string) => ({
      id: 'accounts',
      order: 10,
      component: defineComponent({ render: () => h('div', label) }),
    })
    registerSummaryCard(card('OLD'))
    registerSummaryCard(card('NEW'))

    const wrapper = mountHome()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('NEW')
    expect(wrapper.text()).not.toContain('OLD')
  })
})
