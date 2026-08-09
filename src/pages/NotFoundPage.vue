<template>
  <q-page class="flex flex-center">
    <div class="text-center q-pa-md" style="max-width: 480px" data-testid="not-found">
      <q-icon name="mdi-compass-off-outline" size="64px" color="grey-6" />
      <div class="q-mt-md text-h6">{{ $t('notFound.title') }}</div>
      <div class="q-mt-sm text-body2 text-grey-8">{{ $t('notFound.body') }}</div>
      <q-btn class="q-mt-lg" color="primary" :label="$t('notFound.backHome')" to="/" />
    </div>
  </q-page>
</template>
