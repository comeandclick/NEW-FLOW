import type { Step } from './types'

export const MOTION_STEPS = ['receive', 'analyse', 'plan', 'build', 'compare', 'sound', 'render4k', 'verify'] as const
export const SITE_STEPS = ['interview', 'analyse', 'design', 'structure', 'build', 'data', 'deploy', 'qa', 'motion', 'deliver'] as const

export const freshSteps = (ids: readonly string[]): Step[] => ids.map((id) => ({ id, state: 'todo' }))
