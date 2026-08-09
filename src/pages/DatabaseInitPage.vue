<template>
  <q-page class="flex flex-center">
    <div style="width: 100%; max-width: 500px" class="q-pa-md">
      <div v-if="store.state === 'probing' || store.state === 'creating'" class="text-center">
        <q-spinner size="48px" color="primary" />
        <div class="q-mt-md text-body1">{{ $t('database.probing') }}</div>
      </div>

      <div v-else-if="store.state === 'needs-wizard'">
        <NewDatabaseWizard @create="onWizardCreate" @cancel="onWizardCancel" />
      </div>

      <div v-else-if="store.state === 'migrating'">
        <DatabaseMigration />
      </div>

      <div v-else-if="store.state === 'error'" class="text-center">
        <q-icon name="mdi-alert-circle" size="64px" color="negative" />
        <div class="q-mt-md text-h6">{{ $t('database.errorTitle') }}</div>
        <div class="q-mt-sm text-body2 text-grey-8">{{ store.error }}</div>
        <q-btn
          class="q-mt-md"
          color="primary"
          :label="$t('database.retry')"
          @click="store.probe()"
        />
      </div>
    </div>
  </q-page>
</template>

<script lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { safeRedirectTarget } from '../router'
import { useDatabaseStore } from '../stores/database-store'
import NewDatabaseWizard from '../components/database/NewDatabaseWizard.vue'
import DatabaseMigration from '../components/database/DatabaseMigration.vue'

export default {
  components: {
    NewDatabaseWizard,
    DatabaseMigration,
  },
  setup() {
    const store = useDatabaseStore()
    const router = useRouter()
    const route = useRoute()

    onMounted(() => {
      if (store.state === 'uninitialized') {
        store.probe()
      }
    })

    // This surface exists to reach readiness, so it steps aside the moment it
    // does -- whether readiness came from the wizard or from probing an
    // existing database -- resuming whatever destination was requested
    // (openspec: app-shell-navigation, Home Summary Surface).
    watch(
      () => store.state,
      (state) => {
        if (state === 'ready') {
          router.replace(safeRedirectTarget(route.query.redirect))
        }
      },
      { immediate: true },
    )

    const onWizardCreate = async (currencyId: number, userName: string) => {
      await store.initNewDb(currencyId, userName)
    }

    const onWizardCancel = () => {
      // Stay on /init; wizard dismisses but DB already exists in needs-wizard
    }

    return {
      store,
      onWizardCreate,
      onWizardCancel,
    }
  },
}
</script>
