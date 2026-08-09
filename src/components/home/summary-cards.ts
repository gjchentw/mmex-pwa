import { shallowRef, type Component } from 'vue'

/**
 * The home surface renders whatever cards are registered here, so a later phase
 * contributes one without editing the home page (openspec: app-shell-navigation,
 * Home Summary Surface; design.md D2).
 */
export interface SummaryCard {
  /** Stable identity, used as the render key. */
  id: string
  /** Ascending display order. */
  order: number
  component: Component
}

const cards = shallowRef<SummaryCard[]>([])

export const registerSummaryCard = (card: SummaryCard): void => {
  cards.value = [...cards.value.filter((existing) => existing.id !== card.id), card].sort(
    (a, b) => a.order - b.order,
  )
}

export const summaryCards = cards

/** Clears the registry. Tests only. */
export const resetSummaryCards = (): void => {
  cards.value = []
}

// Later phases register their card here, or from their own module imported by
// the page that owns it. Phase 0 contributes none: the cards worth showing --
// account groups, net worth, upcoming scheduled items -- belong to capabilities
// whose feature requirements do not exist yet (design.md D1).
