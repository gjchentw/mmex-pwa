import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Quasar } from 'quasar'

// Import icon libraries
import '@quasar/extras/mdi-v7/mdi-v7.css'
import quasarIconSet from 'quasar/icon-set/mdi-v7'

// Import Quasar css
import 'quasar/src/css/index.sass'

import App from './App.vue'
import router from './router'
import i18n from './i18n'

const app = createApp(App)

app.use(createPinia())
app.use(i18n)
app.use(router)

app.use(Quasar, {
  plugins: {}, // import Quasar plugins and add here
  iconSet: quasarIconSet,
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
