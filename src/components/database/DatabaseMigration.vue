<template>
  <q-card style="width: 100%; max-width: 400px">
    <q-card-section class="text-center">
      <q-linear-progress
        :value="progress"
        size="24px"
        color="primary"
        class="q-mb-md"
      />
      <div class="text-body1">
        {{ $t('database.upgradingText', { from: migrationFrom, to: migrationTo }) }}
      </div>
      <div class="text-caption text-grey-8 q-mt-xs">
        {{ $t('database.doNotClose') }}
      </div>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { computed } from 'vue'
import { useDatabaseStore } from '../../stores/database-store'

export default {
  setup() {
    const store = useDatabaseStore()

    const progress = computed(() => {
      if (!store.migrationProgress) return 0
      const { from, to, current } = store.migrationProgress
      const total = to - from
      if (total <= 0) return 1
      return (current - from) / total
    })

    const migrationFrom = computed(() => store.migrationProgress?.from ?? 0)
    const migrationTo = computed(() => store.migrationProgress?.to ?? 0)

    return {
      progress,
      migrationFrom,
      migrationTo,
    }
  },
}
</script>
