<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">{{ $t('home.title') }}</div>

    <!-- Cards arrive as later phases register them; Phase 0 ships the frame. -->
    <div v-if="cards.length > 0" class="row q-col-gutter-md" data-testid="home-cards">
      <div v-for="card in cards" :key="card.id" class="col-12 col-sm-6 col-md-4">
        <component :is="card.component" />
      </div>
    </div>

    <q-card v-else flat bordered class="q-pa-lg text-center" data-testid="home-empty">
      <q-icon name="mdi-check-circle-outline" size="48px" color="positive" />
      <div class="q-mt-md text-h6">{{ $t('home.emptyTitle') }}</div>
      <div class="q-mt-sm text-body2 text-grey-8">{{ $t('home.emptyBody') }}</div>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { summaryCards } from '../components/home/summary-cards'

const cards = summaryCards
</script>
