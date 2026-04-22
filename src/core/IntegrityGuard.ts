/**
 * IntegrityGuard — best-effort client-side anti-tamper.
 *
 * What it does:
 *   • Detects clock skew / speedhack (Date.now vs performance.now drift).
 *   • Tracks shadow checksums for the score so external memory edits are
 *     visible to the score-signing path.
 *   • Issues a per-session UUID + nonce to bind score signatures.
 *
 * What it CANNOT do:
 *   • Stop a determined attacker with DevTools — that requires a server.
 */

const _hex = (n: number) => ("00000000" + (n >>> 0).toString(16)).slice(-8);

function _uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try { return (crypto as Crypto).randomUUID(); } catch { /* fallthrough */ }
  }
  const buf = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < 16; i++) buf[i] = (Math.random() * 256) | 0;
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = Array.from(buf, b => ("00" + b.toString(16)).slice(-2));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

export class IntegrityGuard {
  private static _instance: IntegrityGuard | null = null;
  static get instance(): IntegrityGuard {
    if (!IntegrityGuard._instance) IntegrityGuard._instance = new IntegrityGuard();
    return IntegrityGuard._instance;
  }

  readonly sessionId = _uuid();
  readonly startedAt = Date.now();
  private readonly _perfStart = typeof performance !== "undefined" ? performance.now() : 0;

  private _scoreShadow = 0;
  private _scoreChecksum = 0x9e3779b1;
  private _tainted = false;
  private _taintReasons = new Set<string>();

  /** Publicly read-only flag. Sticky once set. */
  get isTainted(): boolean { return this._tainted; }
  get taintReasons(): string[] { return Array.from(this._taintReasons); }

  taint(reason: string): void {
    this._tainted = true;
    this._taintReasons.add(reason);
  }

  /** Call from the legitimate score setter every time the score changes. */
  recordScore(newScore: number): void {
    if (!Number.isFinite(newScore)) { this.taint("score-nan"); return; }
    this._scoreShadow = newScore | 0;
    // Rolling FNV-1a-ish checksum over the score history.
    this._scoreChecksum = ((this._scoreChecksum ^ this._scoreShadow) * 16777619) >>> 0;
  }

  /** Compare an external "current" score against the shadow. Mismatch = taint. */
  verifyScore(externalScore: number): boolean {
    if ((externalScore | 0) !== this._scoreShadow) {
      this.taint(`score-mismatch:${externalScore}!=${this._scoreShadow}`);
      return false;
    }
    return true;
  }

  /** Speedhack heuristic. Call periodically (e.g. once per second). */
  checkClockDrift(): void {
    if (typeof performance === "undefined") return;
    const elapsedReal = Date.now() - this.startedAt;
    const elapsedPerf = performance.now() - this._perfStart;
    if (elapsedReal < 5000) return; // need a baseline
    const ratio = elapsedPerf / Math.max(1, elapsedReal);
    // > 25% drift in either direction = something is messing with timers.
    if (ratio < 0.75 || ratio > 1.25) {
      this.taint(`clock-drift:${ratio.toFixed(3)}`);
    }
  }

  /** Build a signing nonce that binds (score, wave, session, time, integrity). */
  buildNonce(score: number, wave: number): string {
    const t = Date.now();
    const tag = this._tainted ? "T" : "G";
    const c = _hex(this._scoreChecksum);
    return `${this.sessionId}:${t}:${wave}:${score}:${c}:${tag}`;
  }

  /** Reset (e.g. on game restart). Session id stays. */
  resetRun(): void {
    this._scoreShadow = 0;
    this._scoreChecksum = 0x9e3779b1;
    // Tainted flag is sticky for the session — we don't unset it.
  }
}
