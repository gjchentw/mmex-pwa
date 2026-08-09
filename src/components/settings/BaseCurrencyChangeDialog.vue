<template>
  <q-dialog v-model="visible" persistent>
    <q-card style="width: 100%; max-width: 460px" data-testid="base-currency-confirm">
      <q-card-section>
        <div class="text-h6">{{ $t('settings.baseCurrencyChangeTitle') }}</div>
      </q-card-section>

      <q-card-section>
        <div class="text-body1 text-warning q-mb-sm">
          <q-icon name="mdi-alert" size="24px" class="q-mr-sm" />
          {{ $t('settings.baseCurrencyChangeWarning') }}
        </div>
        <div class="text-body2 text-grey-8">
          {{ $t('settings.baseCurrencyChangeDetail') }}
        </div>
        <div v-if="targetName" class="text-body2 q-mt-md">
          {{ $t('settings.baseCurrencyChangeTarget', { currency: targetName }) }}
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" @click="onCancel" />
        <q-btn
          color="primary"
          :label="$t('common.continue')"
          data-testid="base-currency-confirm-accept"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { ref, watch } from 'vue'

/**
 * The base currency is what every conversion is measured against, so the change
 * is stated in those terms before it is written (openspec:
 * file-metadata-and-settings, Base Currency Change Confirmation).
 */
export default {
  props: {
    modelValue: { type: Boolean, default: false },
    targetName: { type: String, default: '' },
  },
  emits: ['update:modelValue', 'confirm', 'cancel'],
  setup(props, { emit }) {
    const visible = ref(props.modelValue)

    watch(
      () => props.modelValue,
      (value) => {
        visible.value = value
      },
    )
    watch(visible, (value) => emit('update:modelValue', value))

    const close = () => {
      visible.value = false
    }

    return {
      visible,
      onConfirm() {
        emit('confirm')
        close()
      },
      onCancel() {
        emit('cancel')
        close()
      },
    }
  },
}
</script>
