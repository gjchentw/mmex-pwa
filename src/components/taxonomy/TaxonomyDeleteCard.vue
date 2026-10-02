<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaxonomyKind } from '../../domain/repos/taxonomy'

/**
 * The content of every taxonomy deletion confirmation (openspec:
 * transaction-taxonomy, the three "Deletion from the Surface" requirements).
 * A deletion is always confirmed (operator decision 2026-10-02); when only
 * trashed transactions reference the entity the card adds desktop's purge
 * sentences. Kept apart from the dialog so it renders under test.
 */

const props = withDefaults(
  defineProps<{
    kind: TaxonomyKind
    title: string
    names: readonly string[]
    lines?: readonly string[]
    purge?: boolean
    /** The tag name desktop puts into its purge sentence. */
    purgeName?: string
  }>(),
  { lines: () => [], purge: false, purgeName: '' },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useI18n()

const KIND_SUFFIX = { category: 'Category', payee: 'Payee', tag: 'Tag' } as const

const purgeLines = computed(() =>
  props.purge
    ? [
        t(`taxonomy.purge.exist${KIND_SUFFIX[props.kind]}`, { name: props.purgeName }),
        t(`taxonomy.purge.will${KIND_SUFFIX[props.kind]}`),
        t('taxonomy.purge.continue'),
      ]
    : [],
)
</script>

<template>
  <q-card style="width: 100%; max-width: 560px" data-testid="taxonomy-delete-card">
    <q-card-section class="row items-center no-wrap">
      <q-avatar icon="mdi-alert-circle" color="negative" text-color="white" />
      <div class="text-h6 q-ml-md">{{ title }}</div>
    </q-card-section>

    <q-card-section>
      <div class="text-weight-medium" data-testid="taxonomy-delete-names">
        {{ names.join(', ') }}
      </div>
      <ul v-if="lines.length > 0" class="q-mt-sm q-mb-none" data-testid="taxonomy-delete-lines">
        <li v-for="(line, index) in lines" :key="index">{{ line }}</li>
      </ul>
      <q-banner
        v-if="purge"
        dense
        class="bg-warning text-dark q-mt-md"
        data-testid="taxonomy-delete-purge"
      >
        <div v-for="(line, index) in purgeLines" :key="index">{{ line }}</div>
      </q-banner>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn
        flat
        :label="$t('common.cancel')"
        data-testid="taxonomy-delete-cancel"
        @click="emit('cancel')"
      />
      <q-btn
        flat
        color="negative"
        :label="$t('common.delete')"
        data-testid="taxonomy-delete-confirm"
        @click="emit('confirm')"
      />
    </q-card-actions>
  </q-card>
</template>
