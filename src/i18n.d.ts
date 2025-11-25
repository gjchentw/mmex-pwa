type Translation = (
  path: string,
  option?: Record<string, unknown>,
) => import('vue').ComputedRef<string>
interface I18n {
  locale: string
  language: Record<string, unknown>
  t: Translation
}
