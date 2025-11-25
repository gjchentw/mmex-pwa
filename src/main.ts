import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Quasar } from 'quasar'
import { createI18n } from 'vue-i18n'

// Import icon libraries
import '@quasar/extras/mdi-v7/mdi-v7.css'

// Import Quasar css
import 'quasar/src/css/index.sass'

import App from './App.vue'
import router from './router'

// Import locale messages
import enUS from './locales/en-US.json'
import zhTW from './locales/zh-TW.json'

// Create i18n instance
const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  fallbackLocale: 'en-US',
  messages: {
    'en-US': enUS,
    'zh-TW': zhTW,
  },
})

const app = createApp(App)

app.use(createPinia())
app.use(i18n)
app.use(router)

app.use(Quasar, {
  plugins: {}, // import Quasar plugins and add here
  config: {
    brand: {
      primary: '#006800',
      secondary: '#dcfcd2',
      accent: '#689f38',
      positive: '#4caf50',
      negative: '#e53935',
      info: '#2196f3',
      warning: '#ffc107',
    },
    /*
    notify: {...}, // default set of options for Notify Quasar plugin
    loading: {...}, // default set of options for Loading Quasar plugin
    loadingBar: { ... }, // settings for LoadingBar Quasar plugin
    // ..and many more (check Installation card on each Quasar component/directive/plugin)
    */
  },
})
app.mount('#app')
