import type { Key } from '@/i18n/dict'
import { dictionaries } from '@/i18n/dict'

/** Maps an activity action to a translation key; falls back to a generic phrase. */
export function actionKey(action: string): Key {
  const key = `act.${action}` as Key
  return key in dictionaries.fr ? key : 'act.other'
}
