/**
 * Stops calling a failing dependency for a while. After `threshold` failures in a row it opens:
 * calls are refused until `cooldownMs` have passed. Then one trial call goes through; its
 * success closes the breaker, its failure opens it for another cool-down.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialRunning = false;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Whether a call may go ahead now. While half-open, only one call (the trial) gets a yes;
   * the caller must report its outcome with `recordSuccess` or `recordFailure`.
   */
  tryAcquire(): boolean {
    if (this.openedAt === null) return true;
    if (this.trialRunning || this.now() - this.openedAt < this.cooldownMs) return false;
    this.trialRunning = true;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.trialRunning = false;
  }

  /** Returns true when this failure opened the breaker (not when a trial failed). */
  recordFailure(): boolean {
    this.failures++;
    if (this.openedAt !== null) {
      this.trialRunning = false;
      this.openedAt = this.now();
      return false;
    }
    if (this.failures < this.threshold) return false;
    this.openedAt = this.now();
    return true;
  }
}
