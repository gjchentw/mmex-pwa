<template>
  <q-dialog v-model="visible" persistent>
    <q-card style="width: 100%; max-width: 400px">
      <q-card-section>
        <div class="text-h6">{{ $t('database.destroyTitle') }}</div>
      </q-card-section>

      <q-card-section>
        <div class="text-body1 text-negative q-mb-sm">
          <q-icon name="mdi-alert" size="24px" class="q-mr-sm" />
          {{ $t('database.destroyWarning') }}
        </div>
        <div class="text-body2 text-grey-8">
          {{ $t('database.destroyDetail') }}
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" @click="onCancel" />
        <q-btn
          color="negative"
          :label="$t('common.continue')"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { ref, watch } from 'vue'

export default {
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue', 'confirm', 'cancel'],
  setup(props, { emit }) {
    const visible = ref(props.modelValue)

    watch(
      () => props.modelValue,
      (val) => {
        visible.value = val
      },
    )

    watch(visible, (val) => {
      emit('update:modelValue', val)
    })

    const onConfirm = () => {
      visible.value = false
      emit('confirm')
    }

    const onCancel = () => {
      visible.value = false
      emit('cancel')
    }

    return {
      visible,
      onConfirm,
      onCancel,
    }
  },
}
</script>
