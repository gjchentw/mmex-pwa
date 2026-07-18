<template>
  <q-page class="q-pa-md">
    <div class="text-h6">COEP probe (dev only)</div>
    <div class="q-mt-sm text-body2">
      Empirically validates the two Google surfaces under the current COEP value (openspec:
      cloud-file-sync task 1.2). Not routed in production builds.
    </div>

    <q-list bordered class="q-mt-md" style="max-width: 640px">
      <q-item>
        <q-item-section>crossOriginIsolated</q-item-section>
        <q-item-section side>
          <q-badge :color="isolated ? 'positive' : 'negative'">{{ isolated }}</q-badge>
        </q-item-section>
      </q-item>

      <q-item>
        <q-item-section>
          <div>1. GIS token popup ({{ clientIdState }})</div>
          <div v-if="tokenResult" class="text-caption">{{ tokenResult }}</div>
        </q-item-section>
        <q-item-section side>
          <q-btn dense color="primary" label="Request token" @click="requestToken" />
        </q-item-section>
      </q-item>

      <q-item>
        <q-item-section>
          <div>2. Bearer-only drive.files.list</div>
          <div v-if="listResult" class="text-caption" style="word-break: break-all">
            {{ listResult }}
          </div>
        </q-item-section>
        <q-item-section side>
          <q-btn dense color="primary" label="List files" :disable="!token" @click="listFiles" />
        </q-item-section>
      </q-item>
    </q-list>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Minimal ambient shape for the GIS token client; the real integration (task
// 3.2) will carry proper types. Kept local to the dev-only probe.
type TokenClient = { requestAccessToken: () => void }
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
          }) => TokenClient
        }
      }
    }
  }
}

const isolated = ref(window.crossOriginIsolated)
const token = ref('')
const tokenResult = ref('')
const listResult = ref('')

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const clientIdState = clientId ? 'client id present' : 'VITE_GOOGLE_CLIENT_ID missing in .env'

const loadGis = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google?.accounts) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('GIS script failed to load (COEP block?)'))
    document.head.appendChild(s)
  })

const requestToken = async () => {
  tokenResult.value = 'loading GIS...'
  try {
    await loadGis()
    if (!clientId) {
      tokenResult.value = 'FAIL: no client id configured'
      return
    }
    tokenResult.value = 'opening popup...'
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        if (resp.access_token) {
          token.value = resp.access_token
          tokenResult.value = `PASS: token acquired (${resp.access_token.slice(0, 8)}...)`
        } else {
          tokenResult.value = `FAIL: ${resp.error ?? 'no token in response'}`
        }
      },
    })
    client.requestAccessToken()
  } catch (err: unknown) {
    tokenResult.value = `FAIL: ${err instanceof Error ? err.message : String(err)}`
  }
}

const listFiles = async () => {
  listResult.value = 'fetching...'
  try {
    const r = await fetch(
      'https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id,name)',
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
    const body = await r.json()
    listResult.value = r.ok
      ? `PASS: HTTP ${r.status}, ${body.files?.length ?? 0} file(s) visible`
      : `FAIL: HTTP ${r.status} ${JSON.stringify(body).slice(0, 120)}`
  } catch (err: unknown) {
    listResult.value = `FAIL: ${err instanceof Error ? err.message : String(err)}`
  }
}
</script>
