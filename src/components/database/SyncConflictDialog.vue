<template>
  <q-dialog :model-value="!!sync.conflict" persistent>
    <q-card style="min-width: 340px; max-width: 90vw">
      <q-card-section class="text-h6">
        <q-icon name="mdi-alert" color="warning" class="q-mr-sm" />{{ $t('sync.conflictTitle') }}
      </q-card-section>

      <q-card-section class="q-pt-none text-body2">
        {{ $t('sync.conflictDetail') }}
        <q-list v-if="sync.conflict" dense class="q-mt-sm">
          <q-item>
            <q-item-section>
              <q-item-label caption>{{ $t('sync.conflictLocal') }}</q-item-label>
              <q-item-label>{{ formatSide(sync.conflict.localTimestamp) }}</q-item-label>
              <q-item-label caption class="text-mono">{{
                sync.conflict.localChecksum
              }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>
              <q-item-label caption>{{ $t('sync.conflictRemote') }}</q-item-label>
              <q-item-label>{{ formatSide(sync.conflict.remoteTimestamp) }}</q-item-label>
              <q-item-label caption class="text-mono">{{
                sync.conflict.remoteChecksum
              }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <!-- Exactly two resolutions; no dismiss without deciding
           (spec: Manual Conflict Resolution). -->
      <q-card-actions align="right">
        <q-btn
          flat
          no-caps
          color="primary"
          :label="$t('sync.keepRemote')"
          @click="sync.resolveConflict('remote')"
        />
        <q-btn
          color="primary"
          no-caps
          :label="$t('sync.keepLocal')"
          @click="sync.resolveConflict('local')"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { useDriveSyncStore } from '../../stores/drive-sync-store'

const sync = useDriveSyncStore()
const formatSide = (ts: number) => new Date(ts).toLocaleString()
</script>
