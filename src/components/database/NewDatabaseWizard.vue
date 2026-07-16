<template>
  <q-card style="width: 100%; max-width: 500px">
    <q-card-section>
      <div class="text-h6">{{ $t('database.newTitle') }}</div>
    </q-card-section>

    <q-card-section>
      <q-select
        v-model="selectedCurrency"
        :options="currencies"
        option-value="id"
        option-label="label"
        :label="$t('database.baseCurrency')"
        :placeholder="$t('database.searchCurrency')"
        use-input
        input-debounce="0"
        @filter="filterCurrencies"
        :loading="loading"
        clearable
        class="q-mb-md"
      >
        <template #no-option>
          <q-item>
            <q-item-section class="text-grey">
              {{ $t('database.noResults') }}
            </q-item-section>
          </q-item>
        </template>
      </q-select>

      <q-input
        v-model="userName"
        :label="$t('database.userName')"
        :placeholder="$t('database.userNamePlaceholder')"
        class="q-mb-md"
      />
    </q-card-section>

    <q-card-actions align="right">
      <q-btn flat :label="$t('common.cancel')" @click="$emit('cancel')" />
      <q-btn
        color="primary"
        :label="$t('common.create')"
        :disable="!selectedCurrency"
        @click="onCreate"
      />
    </q-card-actions>
  </q-card>
</template>

<script lang="ts">
import { ref, onMounted } from 'vue'
import currenciesData from '../../data/currencies.json'

interface CurrencyOption {
  id: number
  label: string
  code: string
}

export default {
  emits: ['create', 'cancel'],
  setup(props, { emit }) {
    const allCurrencies = ref<CurrencyOption[]>([])
    const currencies = ref<CurrencyOption[]>([])
    const selectedCurrency = ref<CurrencyOption | null>(null)
    const userName = ref('')
    const loading = ref(false)

    onMounted(() => {
      allCurrencies.value = currenciesData.map((c) => ({
        id: c.id,
        label: `${c.name} (${c.code})`,
        code: c.code,
      }))
      currencies.value = [...allCurrencies.value]
    })

    const filterCurrencies = (val: string, update: (fn: () => void) => void) => {
      if (val === '') {
        update(() => {
          currencies.value = [...allCurrencies.value]
        })
        return
      }

      update(() => {
        const needle = val.toLowerCase()
        currencies.value = allCurrencies.value.filter(
          (c) => c.label.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle),
        )
      })
    }

    const onCreate = () => {
      if (selectedCurrency.value) {
        emit('create', selectedCurrency.value.id, userName.value)
      }
    }

    return {
      currencies,
      selectedCurrency,
      userName,
      loading,
      filterCurrencies,
      onCreate,
    }
  },
}
</script>
