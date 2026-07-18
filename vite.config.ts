import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'
import vueDevTools from 'vite-plugin-vue-devtools'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'

// sqlite3.wasm must keep its unhashed name: the sqlite-wasm package's pre-js
// unconditionally overwrites any caller-supplied locateFile and resolves
// 'sqlite3.wasm' against its own module URL -- in a bundle, that is
// <outdir>/assets/sqlite3.wasm. Emitting the file unhashed makes the URL the
// engine actually requests be a real asset. Cache correctness is preserved:
// the service worker precaches it with a content-based revision, and the host
// revalidates by ETag. (openspec: fix-wasm-path-resolution)
const keepSqliteWasmUnhashed = (info: { names?: string[]; name?: string }) => {
  const names = info.names ?? (info.name ? [info.name] : [])
  return names.includes('sqlite3.wasm') ? 'assets/[name][extname]' : 'assets/[name]-[hash][extname]'
}

// The OPFS VFS spawns a helper worker the same way: sqlite3.mjs does
// `new Worker(new URL('sqlite3-opfs-async-proxy.js', import.meta.url))`, which
// in a bundle resolves to <outdir>/assets/sqlite3-opfs-async-proxy.js. The
// variable form cannot be rewritten by Vite and nothing references the file
// statically, so emit it ourselves -- straight from the installed package, no
// forked copy. Without it, OPFS init fails and every open ends in
// SQLITE_CANTOPEN. (openspec: fix-wasm-path-resolution)
const emitSqliteOpfsProxy = (): Plugin => ({
  name: 'emit-sqlite3-opfs-async-proxy',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'assets/sqlite3-opfs-async-proxy.js',
      source: readFileSync(
        fileURLToPath(
          new URL(
            './node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3-opfs-async-proxy.js',
            import.meta.url,
          ),
        ),
      ),
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    // @quasar/plugin-vite options list:
    // https://github.com/quasarframework/quasar/blob/dev/vite-plugin/index.d.ts
    quasar(),
    vueJsx(),
    VitePWA({
      workbox: {
        // Workbox's default treats everything under assets/ as self-revisioned
        // by filename (revision:null). sqlite3.wasm and the OPFS proxy are now
        // deliberately UNHASHED there, so they must carry content-based
        // revisions or a package upgrade would ship a new worker with a stale
        // cached wasm. Only trust filenames that actually contain a hash.
        dontCacheBustURLsMatching: /assets\/.+-[A-Za-z0-9_-]{8}\.\w+$/,
      },
      manifest: {
        name: 'MoneyManagerEx PWA',
        short_name: 'MMEX',
        description:
          'MoneyManagerEx as an installable web app: client-side SQLite finance tracking with no backend',
        // Matches the Quasar brand primary set in main.ts.
        theme_color: '#006800',
        background_color: '#ffffff',
        // Programmatically generated placeholders (brand tile + "M"), not a
        // finished product identity. Replace when real artwork exists.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
    vueDevTools(),
    VueI18nPlugin({
      include: [fileURLToPath(new URL('./src/locales/**', import.meta.url))],
    }),
    emitSqliteOpfsProxy(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // SQLite WASM + OPFS need SharedArrayBuffer, which browsers only expose in a
  // cross-origin isolated context. Vite reads dev and preview headers from
  // separate sections, so both must set them -- Playwright runs the CI e2e suite
  // against `vite preview`, which would otherwise serve no isolation headers.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    rollupOptions: {
      output: { assetFileNames: keepSqliteWasmUnhashed },
    },
  },
  worker: {
    // The wasm asset is emitted by the WORKER sub-build (it is referenced from
    // sqlite.worker.ts), which has its own rollup output options -- the
    // top-level build.rollupOptions does not apply to it.
    rollupOptions: {
      output: { assetFileNames: keepSqliteWasmUnhashed },
    },
  },
})
