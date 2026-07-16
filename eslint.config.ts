import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginPlaywright from 'eslint-plugin-playwright'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  // `mmex/**` holds the upstream MoneyManagerEx submodules. They are vendored,
  // not ours to lint or fix -- and `npm run lint` passes `--fix`, so without this
  // ignore it would rewrite files inside the submodules.
  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/mmex/**']),

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  {
    name: 'app/tests-allow-any',
    files: ['src/**/__tests__/*'],
    rules: {
      // `any` is idiomatic when hand-rolling mocks; typing them fully adds noise, not safety.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },


  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['e2e/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },
  skipFormatting,
)
