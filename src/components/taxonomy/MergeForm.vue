<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaxonomyKind, TaxonomyUsage } from '../../domain/repos/taxonomy'
import { describeTaxonomyError } from './taxonomy-messages'

/**
 * Desktop's Merge dialog for one kind (openspec: transaction-taxonomy, Merge
 * Screens; design D7): used entities as sources, visible ones as targets, the
 * per-table counts before, a confirmation "From … to …", the changed count
 * after. Kept apart from the dialog so it renders under test.
 */

export interface MergeOption {
  id: number
  label: string
  hidden: boolean
  used: boolean
  hasChildren?: boolean
}

export interface MergeOutcome {
  changed: number
  collapsed?: number
}

type Choice = { label: string; value: number }

const props = defineProps<{
  kind: TaxonomyKind
  options: readonly MergeOption[]
  /** A source chosen before the screen opened, such as the selected payee. */
  initialSource?: number | null
  usageOf: (id: number) => Promise<TaxonomyUsage>
  relocate: (from: number, to: number, options: { deleteSource: boolean }) => Promise<MergeOutcome>
}>()

const emit = defineEmits<{ merged: [outcome: MergeOutcome]; cancel: [] }>()
const { t } = useI18n()

const KIND_SUFFIX = { category: 'Category', payee: 'Payee', tag: 'Tag' } as const
const COUNT_KEYS: Record<TaxonomyKind, Array<keyof TaxonomyUsage>> = {
  category: ['transactions', 'splits', 'series', 'seriesSplits', 'payeeDefaults', 'budgetRows'],
  payee: ['transactions', 'series'],
  tag: ['transactions', 'splits', 'series', 'seriesSplits'],
}

const initialChoice = (): Choice | null => {
  const option = props.options.find((o) => o.id === props.initialSource)
  return option?.used ? toChoice(option) : null
}
const source = ref<Choice | null>(null)
const target = ref<Choice | null>(null)
const deleteSource = ref(false)
const counts = ref<TaxonomyUsage | null>(null)
const confirming = ref(false)
const busy = ref(false)
const error = ref('')
const outcome = ref<MergeOutcome | null>(null)

const toChoice = (option: MergeOption): Choice => ({ label: option.label, value: option.id })
const sourceOptions = computed(() => props.options.filter((o) => o.used).map(toChoice))
const targetOptions = computed(() =>
  props.options.filter((o) => !o.hidden && o.id !== source.value?.value).map(toChoice),
)
const sourceOption = computed(() => props.options.find((o) => o.id === source.value?.value) ?? null)
/** Desktop removes a source category only when it has no subcategories. */
const deleteSourceDisabled = computed(
  () => props.kind === 'category' && sourceOption.value?.hasChildren === true,
)
const countLines = computed(() =>
  counts.value
    ? COUNT_KEYS[props.kind].map((key) =>
        t(`taxonomy.merge.counts.${key}`, { count: counts.value![key] as number }),
      )
    : [],
)
const canMerge = computed(() => source.value !== null && target.value !== null && !busy.value)

watch(
  source,
  async (choice) => {
    counts.value = null
    confirming.value = false
    outcome.value = null
    error.value = ''
    if (target.value?.value === choice?.value) target.value = null
    if (deleteSourceDisabled.value) deleteSource.value = false
    if (choice) counts.value = await props.usageOf(choice.value)
  },
  { immediate: true },
)
watch(
  () => props.initialSource,
  () => {
    source.value = initialChoice()
  },
  { immediate: true },
)

const startConfirm = () => {
  error.value = ''
  confirming.value = true
}

const accept = async () => {
  if (!source.value || !target.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await props.relocate(source.value.value, target.value.value, {
      deleteSource: deleteSource.value,
    })
    outcome.value = result
    confirming.value = false
    emit('merged', result)
  } catch (err) {
    error.value =
      describeTaxonomyError(err, t) ?? (err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <q-card style="width: 100%; max-width: 560px" data-testid="merge-form">
    <q-card-section>
      <div class="text-h6">{{ $t(`taxonomy.merge.title${KIND_SUFFIX[kind]}`) }}</div>
    </q-card-section>

    <q-card-section class="q-gutter-md">
      <q-select
        v-model="source"
        :options="sourceOptions"
        :label="$t('taxonomy.merge.source')"
        outlined
        dense
        data-testid="merge-source"
      />
      <q-select
        v-model="target"
        :options="targetOptions"
        :label="$t('taxonomy.merge.target')"
        outlined
        dense
        :disable="!source"
        data-testid="merge-target"
      />
      <div v-if="counts" class="text-caption" data-testid="merge-counts">
        <div v-for="line in countLines" :key="line">{{ line }}</div>
      </div>
      <q-checkbox
        v-model="deleteSource"
        :disable="deleteSourceDisabled"
        :label="$t(`taxonomy.merge.deleteSource${KIND_SUFFIX[kind]}`)"
        data-testid="merge-delete-source"
      />
      <q-banner
        v-if="confirming && source && target"
        dense
        class="bg-grey-2"
        data-testid="merge-confirmation"
      >
        <div class="text-weight-medium">{{ $t('taxonomy.merge.pleaseConfirm') }}</div>
        <div>{{ $t('taxonomy.merge.fromTo', { source: source.label, target: target.label }) }}</div>
        <template #action>
          <q-btn flat :label="$t('common.cancel')" @click="confirming = false" />
          <q-btn
            flat
            color="primary"
            :label="$t('taxonomy.merge.action')"
            :loading="busy"
            data-testid="merge-confirm-accept"
            @click="accept"
          />
        </template>
      </q-banner>
      <div v-if="error" class="text-negative" data-testid="merge-error">{{ error }}</div>
      <q-banner v-if="outcome" dense class="bg-positive text-white" data-testid="merge-result">
        <div>{{ $t(`taxonomy.merge.completed${KIND_SUFFIX[kind]}`) }}</div>
        <div>{{ $t('taxonomy.merge.changed', { count: outcome.changed }) }}</div>
        <div v-if="outcome.collapsed !== undefined">
          {{ $t('taxonomy.merge.collapsed', { count: outcome.collapsed }) }}
        </div>
      </q-banner>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat :label="$t('common.close')" data-testid="merge-cancel" @click="emit('cancel')" />
      <q-btn
        color="primary"
        :label="$t('taxonomy.merge.action')"
        :disable="!canMerge || confirming"
        data-testid="merge-confirm"
        @click="startConfirm"
      />
    </q-card-actions>
  </q-card>
</template>
