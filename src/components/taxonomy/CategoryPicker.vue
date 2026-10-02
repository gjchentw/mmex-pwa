<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CategoryRecord } from '../../domain/records'
import {
  CATEGORY_ROOT_ID,
  categoryFullName,
  categorySubtree,
  isHidden,
} from '../../domain/rules/taxonomy'

/**
 * Picks a category by full name (openspec: transaction-taxonomy, Visibility via
 * Active Flags: hidden categories are not offered for a new value, but a hidden
 * current value stays selectable). `excludeSubtreeOf` removes a category and its
 * descendants, which is how a cyclic move is never offered; `allowTopLevel`
 * adds the root sentinel for Move to… (design D12).
 */

type Option = { label: string; value: number }

const props = withDefaults(
  defineProps<{
    modelValue: number | null
    categories: readonly CategoryRecord[]
    delimiter?: string
    excludeSubtreeOf?: number | null
    allowTopLevel?: boolean
    label?: string
  }>(),
  { delimiter: ':', excludeSubtreeOf: null, allowTopLevel: false, label: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()
const { t } = useI18n()

const options = computed<Option[]>(() => {
  const excluded = new Set<number>()
  if (props.excludeSubtreeOf !== null) {
    excluded.add(props.excludeSubtreeOf)
    for (const child of categorySubtree(props.categories, props.excludeSubtreeOf)) {
      excluded.add(child.CATEGID)
    }
  }
  const list = props.categories
    .filter(
      (category) =>
        !excluded.has(category.CATEGID) &&
        (!isHidden(category) || category.CATEGID === props.modelValue),
    )
    .map((category) => ({
      label: categoryFullName(category.CATEGID, props.categories, props.delimiter),
      value: category.CATEGID,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return props.allowTopLevel
    ? [{ label: t('category.topLevel'), value: CATEGORY_ROOT_ID }, ...list]
    : list
})

const selected = computed(
  () => options.value.find((option) => option.value === props.modelValue) ?? null,
)

const onUpdate = (option: Option | number | null) => {
  if (option === null) emit('update:modelValue', null)
  else emit('update:modelValue', typeof option === 'number' ? option : option.value)
}
</script>

<template>
  <q-select
    :model-value="selected"
    :options="options"
    :label="label ?? $t('category.parent')"
    outlined
    dense
    clearable
    data-testid="category-picker"
    @update:model-value="onUpdate"
  />
</template>
