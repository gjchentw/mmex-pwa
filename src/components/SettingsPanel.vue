<template>
  <div>
    <q-tabs v-model="tab" dense align="left" class="q-mb-md">
      <q-tab name="general" :label="$t('settings.general')" />
      <q-tab name="appearance" :label="$t('settings.appearance')" />
    </q-tabs>

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="general">
        <div class="q-gutter-md" style="max-width: 400px">
          <q-select
            v-model="form.language"
            :options="languageOptions"
            :label="$t('settings.language')"
            emit-value
            map-options
            dense
            @update:model-value="(v: string) => saveSetting('LANGUAGE', v)"
          />

          <q-select
            v-model="form.dateFormat"
            :options="dateFormatOptions"
            :label="$t('settings.dateFormat')"
            emit-value
            map-options
            dense
            @update:model-value="(v: string) => saveSetting('DATEFORMAT', v)"
          />

          <q-input
            v-model="form.baseCurrencyId"
            :label="$t('settings.baseCurrency')"
            dense
            type="number"
            @change="saveSetting('BASECURRENCYID', String(form.baseCurrencyId))"
          />

          <q-input
            v-model="form.userName"
            :label="$t('settings.userName')"
            dense
            @change="saveSetting('USERNAME', form.userName)"
          />
        </div>
      </q-tab-panel>

      <q-tab-panel name="appearance">
        <div style="max-width: 400px">
          <q-option-group
            v-model="form.themeMode"
            :options="themeOptions"
            type="radio"
            @update:model-value="(v: string) => saveSetting('THEME_MODE', v)"
          />
        </div>
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettings } from '@/composables/useSettings'

const { t } = useI18n()
const settingsComposable = useSettings()

const form = reactive({
  language: 'en_US',
  dateFormat: '%Y-%m-%d',
  baseCurrencyId: 1 as number | null,
  userName: '',
  themeMode: 'auto',
})

const tab = ref('general')

const languageOptions = [
  { label: 'English', value: 'en_US' },
  { label: '中文（繁體）', value: 'zh_TW' },
]

const dateFormatOptions = [
  { label: 'YYYY-MM-DD', value: '%Y-%m-%d' },
  { label: 'YYYY/MM/DD', value: '%Y/%m/%d' },
  { label: 'MM/DD/YYYY', value: '%m/%d/%Y' },
  { label: 'DD/MM/YYYY', value: '%d/%m/%Y' },
]

const themeOptions = [
  { label: t('settings.light'), value: 'light' },
  { label: t('settings.dark'), value: 'dark' },
  { label: t('settings.auto'), value: 'auto' },
]

async function saveSetting(key: string, value: string) {
  await settingsComposable.set(key, value)
}

onMounted(async () => {
  await settingsComposable.refresh()
  form.language = settingsComposable.language.value
  form.dateFormat = settingsComposable.dateFormat.value
  form.baseCurrencyId = settingsComposable.baseCurrencyId.value
  form.userName = settingsComposable.userName.value
  form.themeMode = settingsComposable.themeMode.value
})
</script>
