const MAX_INPUT_HISTORY = 120;
const CORRECTION_SMOOTHING = 0.1;
const POSITION_ERROR_THRESHOLD = 2;

export interface PredictionInput {
  seq: number;
  moveX: number;
  moveY: number;
  deltaMs: number;
}

export class Prediction {
  private inputHistory: PredictionInput[] = [];
  private predictedX = 0;
  private predictedY = 0;
  private displayX = 0;
  private displayY = 0;
  private correctionX = 0;
  private correctionY = 0;
  // lastAcknowledgedSeq tracked via inputHistory pruning in reconcile()
  private speed = 200;
  private arenaWidth = 2400;
  private arenaHeight = 1600;

  configure(speed: number, arenaWidth: number, arenaHeight: number): void {
    this.speed = speed;
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;
  }

  setPosition(x: number, y: number): void {
    this.predictedX = x;
    this.predictedY = y;
    this.displayX = x;
    this.displayY = y;
    this.correctionX = 0;
    this.correctionY = 0;
    this.inputHistory = [];
  }

  applyInput(input: { seq: number; moveX?: number; moveY?: number; dx?: number; dy?: number }, deltaMs: number): void {
    const moveX = input.moveX ?? input.dx ?? 0;
    const moveY = input.moveY ?? input.dy ?? 0;

    const frame: PredictionInput = { seq: input.seq, moveX, moveY, deltaMs };
    this.inputHistory.push(frame);
    while (this.inputHistory.length > MAX_INPUT_HISTORY) {
      this.inputHistory.shift();
    }

    this._simulate(frame);
    this._clamp();
  }

  reconcile(serverX: number, serverY: number, serverTick: number): void {
    while (this.inputHistory.length > 0 && this.inputHistory[0].seq <= serverTick) {
      this.inputHistory.shift();
    }

    let reconX = serverX;
    let reconY = serverY;

    for (const frame of this.inputHistory) {
      const dt = frame.deltaMs / 1000;
      const len = Math.sqrt(frame.moveX * frame.moveX + frame.moveY * frame.moveY);
      const nx = len > 0 ? frame.moveX / len : 0;
      const ny = len > 0 ? frame.moveY / len : 0;
      reconX += nx * this.speed * dt;
      reconY += ny * this.speed * dt;
      reconX = Math.max(20, Math.min(this.arenaWidth - 20, reconX));
      reconY = Math.max(20, Math.min(this.arenaHeight - 20, reconY));
    }

    const errorX = reconX - this.predictedX;
    const errorY = reconY - this.predictedY;
    const errorSq = errorX * errorX + errorY * errorY;

    if (errorSq > POSITION_ERROR_THRESHOLD * POSITION_ERROR_THRESHOLD) {
      this.correctionX += errorX;
      this.correctionY += errorY;
    }

    this.predictedX = reconX;
    this.predictedY = reconY;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.displayX, y: this.displayY };
  }

  update(deltaMs: number): void {
    const lerpFactor = Math.min(1, CORRECTION_SMOOTHING * (deltaMs / 16.67));
    const appliedCorrX = this.correctionX * lerpFactor;
    const appliedCorrY = this.correctionY * lerpFactor;
    this.correctionX -= appliedCorrX;
    this.correctionY -= appliedCorrY;

    this.displayX = this.predictedX - this.correctionX;
    this.displayY = this.predictedY - this.correctionY;
  }

  private _simulate(frame: PredictionInput): void {
    const dt = frame.deltaMs / 1000;
    const len = Math.sqrt(frame.moveX * frame.moveX + frame.moveY * frame.moveY);
    const nx = len > 0 ? frame.moveX / len : 0;
    const ny = len > 0 ? frame.moveY / len : 0;
    this.predictedX += nx * this.speed * dt;
    this.predictedY += ny * this.speed * dt;
  }

  private _clamp(): void {
    const margin = 20;
    this.predictedX = Math.max(margin, Math.min(this.arenaWidth - margin, this.predictedX));
    this.predictedY = Math.max(margin, Math.min(this.arenaHeight - margin, this.predictedY));
  }
}
