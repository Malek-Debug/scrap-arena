export interface RunResult {
  combatScore: number;
  kills: number;
  wave: number;
  maxCombo: number;
  maxStreak: number;
  completed: boolean;
}

// Added to completed runs — bridges a strong death to a strong victory
export const VICTORY_BONUS = 3000;

/**
 * Single source of truth for run score.
 * Both VictoryScene and GameOverScene call this.
 *
 * Calibration (wave 10, combatScore estimates from ComboSystem):
 *   1. Poor    victory  — 20k, 3x  →  ~8 100  → B
 *   2. Low     victory  — 40k, 4x  → ~10 975  → B
 *   3. Normal  victory  — 70k, 6x  → ~15 125  → A
 *   4. Strong  victory  — 100k,12x → ~22 300  → A
 *   5. Excep.  victory  — 120k,20x → ~30 075  → S
 *   6. Wave 8 strong death 80k,10x → ~15 475  → A
 *   7. Wave 10 excep. death 100k,18x→ ~22 700 → A  (+bonus → 25 700 → S if won)
 *
 * Thresholds: S≥24000 · A≥12000 · B≥6000 · C≥2500 · D<2500
 */
export function calculateRunScore(result: RunResult): number {
  const base =
    result.combatScore     +
    result.wave    * 250   +
    result.kills   *  10   +
    result.maxCombo *  50  +
    result.maxStreak * 25;
  return result.completed ? base + VICTORY_BONUS : base;
}

export function calculateRunGrade(score: number): { grade: string; gradeColor: number } {
  if      (score >= 24000) return { grade: "S", gradeColor: 0xffcc00 };
  else if (score >= 12000) return { grade: "A", gradeColor: 0xcc44ff };
  else if (score >= 6000)  return { grade: "B", gradeColor: 0x00ccff };
  else if (score >= 2500)  return { grade: "C", gradeColor: 0x00ff88 };
  else                     return { grade: "D", gradeColor: 0xaaaaaa };
}
