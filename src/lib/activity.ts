import type { Key } from '@/i18n/dict'
import { dictionaries } from '@/i18n/dict'

/** Maps an activity action to a translation key; falls back to a generic phrase. */
export function actionKey(action: string): Key {
  // Les agents de l'API écrivent « task.create », « event.delete »… : même phrase que « task.created ».
  const norm = action.replace(/\.(create|update|delete|request)$/, (_, v: string) => `.${v === 'request' ? 'requested' : `${v}d`}`)
  for (const a of [action, norm]) {
    const key = `act.${a}` as Key
    if (key in dictionaries.fr) return key
  }
  return 'act.other'
}
