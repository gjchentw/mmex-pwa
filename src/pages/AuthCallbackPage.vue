<template>
  <q-page class="flex flex-center">
    <q-spinner size="48px" color="primary" />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGoogleAuthStore } from '../stores/google-auth-store'

// Terminal point of the OAuth redirect flow (openspec: cloud-file-sync,
// design.md D1). The store consumes and strips the URL fragment; this page
// only forwards the user back to where they started.
const router = useRouter()
const auth = useGoogleAuthStore()

onMounted(() => {
  const returnTo = auth.handleCallback()
  router.replace(returnTo)
})
</script>
