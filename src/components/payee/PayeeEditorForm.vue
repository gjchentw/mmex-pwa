<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CategoryRecord, PayeeRecord } from '../../domain/records'
import type { PayeeDraft } from '../../domain/repos/taxonomy'
import {
  parsePayeePatterns,
  payeeDefaultCategory,
  validatePayee,
  validatePayeePatterns,
  type DefaultCategoryMode,
} from '../../domain/rules/taxonomy'
import CategoryPicker from '../taxonomy/CategoryPicker.vue'

/**
 * Desktop's payee editor (openspec: transaction-taxonomy, Payee Editing):
 * Payee, Hidden, the default category titled by the mode, Reference, Website,
 * Notes, and the match patterns one per line (design D11). Refusals from the
 * rules layer sit at their field; PATTERN is submitted only when the lines
 * changed. Kept apart from the dialog so it renders under test.
 */

const props = withDefaults(
  defineProps<{
    payee: PayeeRecord | null
    categories: readonly CategoryRecord[]
    delimiter?: string
    mode: DefaultCategoryMode
    errorMessage?: string
    saving?: boolean
  }>(),
  { delimiter: ':', errorMessage: '', saving: false },
)

const emit = defineEmits<{ save: [draft: PayeeDraft | Partial<PayeeDraft>]; cancel: [] }>()
const { t } = useI18n()

const isNew = computed(() => props.payee === null)

const fromProps = () => ({
  name: props.payee?.PAYEENAME ?? '',
  hidden: props.payee?.ACTIVE === 0,
  categoryId: props.payee ? payeeDefaultCategory(props.payee) : null,
  reference: props.payee?.NUMBER ?? '',
  website: props.payee?.WEBSITE ?? '',
  notes: props.payee?.NOTES ?? '',
  patternsText: props.payee ? parsePayeePatterns(props.payee).join('\n') : '',
})
const draft = ref(fromProps())
const initialPatternsText = ref(draft.value.patternsText)
watch(
  () => props.payee,
  () => {
    draft.value = fromProps()
    initialPatternsText.value = draft.value.patternsText
    refusals.value = {}
  },
)

const refusals = ref<{ name?: string; website?: string; patterns?: string }>({})

const categoryLabel = computed(() =>
  props.mode === 'lastUsed'
    ? t('payee.columns.lastUsedCategory')
    : t('payee.columns.defaultCategory'),
)

const onSave = () => {
  refusals.value = {}
  const lines = draft.value.patternsText.split('\n')
  const fieldRefusal = validatePayee({ PAYEENAME: draft.value.name, WEBSITE: draft.value.website })
  if (fieldRefusal?.field === 'name') refusals.value.name = t('payee.invalid.name')
  if (fieldRefusal?.field === 'website') refusals.value.website = t('payee.invalid.website')
  const patternRefusal = validatePayeePatterns(lines)
  if (patternRefusal) {
    refusals.value.patterns = t('payee.invalid.pattern', { line: (patternRefusal.index ?? 0) + 1 })
  }
  if (refusals.value.name || refusals.value.website || refusals.value.patterns) return

  const patterns = lines.filter((line) => line.trim() !== '')
  const fields = {
    PAYEENAME: draft.value.name,
    CATEGID: draft.value.categoryId,
    NUMBER: draft.value.reference || null,
    WEBSITE: draft.value.website || null,
    NOTES: draft.value.notes || null,
    hidden: draft.value.hidden,
  }
  if (isNew.value) {
    emit('save', { ...fields, patterns })
  } else {
    emit(
      'save',
      draft.value.patternsText === initialPatternsText.value ? fields : { ...fields, patterns },
    )
  }
}
</script>

<template>
  <q-card style="width: 100%; max-width: 560px" data-testid="payee-editor">
    <q-card-section>
      <div class="text-h6">{{ isNew ? $t('payee.addTitle') : $t('payee.editTitle') }}</div>
    </q-card-section>

    <q-card-section class="q-gutter-md">
      <q-input
        v-model="draft.name"
        outlined
        dense
        :label="$t('payee.payee')"
        :error="!!refusals.name"
        :error-message="refusals.name"
        data-testid="payee-name"
      />
      <q-toggle
        v-model="draft.hidden"
        :label="$t('payee.hiddenField')"
        data-testid="payee-hidden"
      />
      <CategoryPicker
        v-model="draft.categoryId"
        :categories="categories"
        :delimiter="delimiter"
        :label="categoryLabel"
      />
      <q-input
        v-model="draft.reference"
        outlined
        dense
        :label="$t('payee.columns.reference')"
        data-testid="payee-reference"
      />
      <q-input
        v-model="draft.website"
        outlined
        dense
        :label="$t('payee.columns.website')"
        :error="!!refusals.website"
        :error-message="refusals.website"
        data-testid="payee-website"
      />
      <q-input
        v-model="draft.notes"
        outlined
        dense
        autogrow
        :label="$t('payee.columns.notes')"
        data-testid="payee-notes"
      />
      <q-input
        v-model="draft.patternsText"
        outlined
        type="textarea"
        :label="$t('payee.patterns')"
        :hint="$t('payee.patternsHint')"
        :error="!!refusals.patterns"
        :error-message="refusals.patterns"
        data-testid="payee-patterns"
      />
      <div v-if="errorMessage" class="text-negative" data-testid="payee-editor-error">
        {{ errorMessage }}
      </div>
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat :label="$t('common.cancel')" data-testid="payee-cancel" @click="emit('cancel')" />
      <q-btn
        color="primary"
        :label="$t('common.save')"
        :loading="saving"
        data-testid="payee-save"
        @click="onSave"
      />
    </q-card-actions>
  </q-card>
</template>
