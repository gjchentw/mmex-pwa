<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">{{ $t('menu.settings') }}</div>
    <SettingsPanel />
  </q-page>
</template>

<script setup lang="ts">
import SettingsPanel from '@/components/SettingsPanel.vue'
</script>
