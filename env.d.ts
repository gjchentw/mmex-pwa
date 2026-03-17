import 'vite/client'
import type {} from './src/types/google'

declare module '@intlify/unplugin-vue-i18n/messages' {
  import { LocaleMessages, VueMessageType } from 'vue-i18n'
  const messages: LocaleMessages<VueMessageType>
  export default messages
}
