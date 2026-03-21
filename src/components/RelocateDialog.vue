<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card style="min-width: 450px">
      <q-card-section>
        <div class="text-h6">{{ $t('relocation.mergeTitle') }} — {{ entityLabel }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-md">
        <q-select
          v-model="sourceId"
          :options="entityOptions"
          :label="$t('relocation.source')"
          emit-value
          map-options
          dense
          @update:model-value="onSourceChange"
        />

        <q-select
          v-model="targetId"
          :options="targetOptions"
          :label="$t('relocation.target')"
          emit-value
          map-options
          dense
        />

        <div v-if="stats" class="q-mt-sm">
          <div class="text-subtitle2">{{ $t('relocation.impactSummary') }}</div>
          <q-list dense>
            <q-item v-if="stats.transactions > 0">
              <q-item-section>{{ $t('relocation.transactions') }}</q-item-section>
              <q-item-section side>{{ stats.transactions }}</q-item-section>
            </q-item>
            <q-item v-if="stats.splitTransactions > 0">
              <q-item-section>{{ $t('relocation.splitTransactions') }}</q-item-section>
              <q-item-section side>{{ stats.splitTransactions }}</q-item-section>
            </q-item>
            <q-item v-if="stats.recurringTransactions > 0">
              <q-item-section>{{ $t('relocation.recurringTransactions') }}</q-item-section>
              <q-item-section side>{{ stats.recurringTransactions }}</q-item-section>
            </q-item>
            <q-item v-if="stats.budgets > 0">
              <q-item-section>{{ $t('relocation.budgets') }}</q-item-section>
              <q-item-section side>{{ stats.budgets }}</q-item-section>
            </q-item>
            <q-item v-if="stats.budgetSplits > 0">
              <q-item-section>{{ $t('relocation.budgetSplits') }}</q-item-section>
              <q-item-section side>{{ stats.budgetSplits }}</q-item-section>
            </q-item>
            <q-item v-if="stats.payeeDefaults > 0">
              <q-item-section>{{ $t('relocation.payeeDefaults') }}</q-item-section>
              <q-item-section side>{{ stats.payeeDefaults }}</q-item-section>
            </q-item>
          </q-list>
        </div>

        <q-checkbox v-model="deleteSource" :label="$t('relocation.deleteSource')" />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" @click="onDialogCancel" />
        <q-btn
          flat
          color="primary"
          :label="$t('relocation.confirm')"
          :disable="!canConfirm"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDialogPluginComponent } from 'quasar'
import type { RelocationStats } from '@/types/entities'

export interface RelocateOption {
  label: string
  value: number
}

const props = defineProps<{
  entityLabel: string
  options: RelocateOption[]
  getStats: (sourceId: number) => Promise<RelocationStats>
  relocate: (sourceId: number, targetId: number, deleteSource: boolean) => Promise<void>
}>()

defineEmits([...useDialogPluginComponent.emits])
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent()

const sourceId = ref<number | null>(null)
const targetId = ref<number | null>(null)
const deleteSource = ref(true)
const stats = ref<RelocationStats | null>(null)

const entityOptions = computed(() => props.options)
const targetOptions = computed(() =>
  props.options.filter((o) => o.value !== sourceId.value),
)
const canConfirm = computed(
  () => sourceId.value !== null && targetId.value !== null && sourceId.value !== targetId.value,
)

async function onSourceChange() {
  stats.value = null
  if (sourceId.value !== null) {
    stats.value = await props.getStats(sourceId.value)
  }
}

async function onConfirm() {
  if (!canConfirm.value) return
  await props.relocate(sourceId.value!, targetId.value!, deleteSource.value)
  onDialogOK()
}
</script>
