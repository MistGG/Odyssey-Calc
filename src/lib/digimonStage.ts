/**
 * Circular portrait gradients by evolution stage — matches the main wiki `SC`
 * palette (Digital Odyssey Wiki).
 */
const ROOKIE_GRADIENT = 'linear-gradient(135deg,#16641e,#22a040)'

export const DIGIMON_STAGE_PORTRAIT_GRADIENT: Record<string, string> = {
  DigiTama: 'linear-gradient(135deg,#3a3a5e,#5a5a80)',
  'In-Training': 'linear-gradient(135deg,#3a3a5e,#5a5a80)',
  Baby: 'linear-gradient(135deg,#3a3a5e,#5a5a80)',
  Rookie: ROOKIE_GRADIENT,
  'Rookie X': ROOKIE_GRADIENT,
  Armor: 'linear-gradient(135deg,#78350f,#d97706)',
  Champion: 'linear-gradient(135deg,#0f2a7a,#1e5ac8)',
  'Champion X': 'linear-gradient(135deg,#0f2a7a,#1e5ac8)',
  Ultimate: 'linear-gradient(135deg,#4a0f8a,#7a28c8)',
  'Ultimate X': 'linear-gradient(135deg,#4a0f8a,#7a28c8)',
  Mega: 'linear-gradient(135deg,#7a3000,#c04a10)',
  'Mega X': 'linear-gradient(135deg,#7a3000,#c04a10)',
  'Burst Mode': 'linear-gradient(135deg,#7a1010,#c02020)',
  'Burst Mode X': 'linear-gradient(135deg,#7a1010,#c02020)',
  Jogress: 'linear-gradient(135deg,#3b0764,#7c3aed)',
  'Jogress X': 'linear-gradient(135deg,#3b0764,#7c3aed)',
  Spirit: 'linear-gradient(135deg,#0f2a7a,#3c78c8)',
  Extra: 'linear-gradient(135deg,#7a3000,#c04a10)',
}

export function digimonStagePortraitGradient(stage: string | undefined): string {
  const k = stage?.trim() ?? ''
  return DIGIMON_STAGE_PORTRAIT_GRADIENT[k] ?? ROOKIE_GRADIENT
}
