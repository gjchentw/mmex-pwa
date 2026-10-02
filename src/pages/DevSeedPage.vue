<script setup lang="ts">
import { ref } from 'vue'
import { db } from '../domain/db'

/**
 * Development-only seam for end-to-end tests (transaction-taxonomy-surfaces,
 * design D10): statements run through the domain layer's batch, a query shows
 * its rows as JSON. Registered only inside the DEV spread of the route table,
 * so production bundles never carry it (openspec: app-shell-navigation, Route
 * Registry Governance — development-only routes stay out of production).
 */

const statements = ref('')
const query = ref('')
const status = ref('')
const error = ref('')
const rows = ref('')

/** One statement per `;` at a line end; blank lines are ignored. */
const splitStatements = (text: string): string[] =>
  text
    .split(/;\s*(?:\n|$)/)
    .map((part) => part.trim())
    .filter((part) => part !== '')

const run = async () => {
  error.value = ''
  status.value = ''
  try {
    const batch = splitStatements(statements.value).map((sql) => ({ sql }))
    await db.mutate(batch)
    status.value = `${batch.length} statements run`
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

const select = async () => {
  error.value = ''
  rows.value = ''
  try {
    const result = await db.query<Record<string, unknown>>(query.value.trim())
    rows.value = JSON.stringify(result)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <q-page class="q-pa-md" data-testid="dev-seed-page">
    <div class="text-h5 q-mb-md">Development seed</div>
    <q-input
      v-model="statements"
      type="textarea"
      outlined
      label="Statements (one per line, ending in ;)"
      data-testid="dev-seed-statements"
    />
    <q-btn class="q-mt-sm" color="primary" label="Run" data-testid="dev-seed-run" @click="run" />
    <div v-if="status" class="q-mt-sm text-positive" data-testid="dev-seed-status">
      {{ status }}
    </div>

    <q-input
      v-model="query"
      type="textarea"
      outlined
      class="q-mt-lg"
      label="Query"
      data-testid="dev-seed-query"
    />
    <q-btn
      class="q-mt-sm"
      color="primary"
      label="Select"
      data-testid="dev-seed-select"
      @click="select"
    />
    <pre v-if="rows" class="q-mt-sm" data-testid="dev-seed-rows">{{ rows }}</pre>
    <div v-if="error" class="q-mt-sm text-negative" data-testid="dev-seed-error">{{ error }}</div>
  </q-page>
</template>
