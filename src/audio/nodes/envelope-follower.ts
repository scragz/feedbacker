
/**
 * Simple envelope follower with configurable attack and release times
 */
export class EnvelopeFollower {
  private envelope: number = 0;
  private attackCoeff: number = 0;
  private releaseCoeff: number = 0;
  private amount: number = 1;
  private enabled: boolean = false;
  private source: string | null = null;

  constructor(
    attack: number = 0.01, // attack time in seconds
    release: number = 0.1, // release time in seconds
    amount: number = 1,
    sampleRate: number = 44100,
    enabled: boolean = false,
    source: string | null = null
  ) {
    this.setAttackTime(attack, sampleRate);
    this.setReleaseTime(release, sampleRate);
    this.amount = amount;
    this.enabled = enabled;
    this.source = source;
  }

  /**
   * Set attack time in seconds
   */
  setAttackTime(attackTime: number, sampleRate: number): void {
    // Convert attack time to coefficient
    // Formula: coeff = e^(-ln(9) / (sampleRate * time))
    this.attackCoeff = Math.exp(-Math.log(9) / (sampleRate * Math.max(0.001, attackTime)));
  }

  /**
   * Set release time in seconds
   */
  setReleaseTime(releaseTime: number, sampleRate: number): void {
    // Convert release time to coefficient
    // Formula: coeff = e^(-ln(9) / (sampleRate * time))
    this.releaseCoeff = Math.exp(-Math.log(9) / (sampleRate * Math.max(0.001, releaseTime)));
  }

  setAmount(amount: number): void {
    this.amount = amount;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setSource(sourceId: string | null): void {
    this.source = sourceId;
  }

  /**
   * Check if this envelope follower is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Process one sample and update the envelope
   * @param input The absolute input value (0 to 1)
   * @returns The current envelope value
   */
  process(input: number): number {
    if (!this.enabled) return 0;

    // Get absolute value of input
    const absInput = Math.abs(input);

    // Attack or release based on input level vs current envelope
    if (absInput > this.envelope) {
      // Attack
      this.envelope = this.attackCoeff * (this.envelope - absInput) + absInput;
    } else {
      // Release
      this.envelope = this.releaseCoeff * (this.envelope - absInput) + absInput;
    }

    // Return envelope scaled by amount
    return this.envelope * this.amount;
  }

  /**
   * Get the current envelope value without updating it
   */
  getCurrentValue(): number {
    return this.enabled ? this.envelope * this.amount : 0;
  }

  /**
   * Check if this envelope follower is configured for the given source
   */
  isForSource(sourceId: string): boolean {
    return this.source === sourceId;
  }
}
