import type { DSPKernel, NodeState } from './dsp-kernel';
import type { LFOWaveformType } from '../schema';

interface LFOState {
  phase: number;
  lastValue: number;
  lastRandomValue: number;
  randomPhase: number;
}

/**
 * Calculates a single LFO value based on current phase and waveform
 */
export function calculateLFOValue(
  waveform: LFOWaveformType,
  phase: number,
  lastRandomValue: number,
  randomPhase: number
): { value: number; lastRandomValue: number; randomPhase: number } {
  let value = 0;
  let newRandomValue = lastRandomValue;
  let newRandomPhase = randomPhase;

  switch (waveform) {
    case 'sine':
      value = Math.sin(2 * Math.PI * phase);
      break;
    case 'square':
      value = phase < 0.5 ? 1 : -1;
      break;
    case 'triangle':
      value = 1 - 4 * Math.abs(Math.round(phase) - phase);
      break;
    case 'sawtooth':
      value = 2 * (phase - Math.floor(phase + 0.5));
      break;
    case 'random':
      // Generate new random value at zero-crossing
      if (phase < randomPhase) {
        newRandomValue = Math.random() * 2 - 1;
        newRandomPhase = phase;
      }
      value = newRandomValue;
      break;
    default:
      value = 0;
  }

  // Normalize to range -1 to 1
  return {
    value: Math.max(-1, Math.min(1, value)),
    lastRandomValue: newRandomValue,
    randomPhase: newRandomPhase
  };
}

export class LFOProcessor {
  private state: LFOState;
  private frequency: number;
  private waveform: LFOWaveformType;
  private amount: number;
  private sampleRate: number;
  private enabled: boolean;

  constructor(
    frequency = 1,
    waveform: LFOWaveformType = 'sine',
    amount = 0,
    sampleRate = 44100,
    enabled = false
  ) {
    this.frequency = frequency;
    this.waveform = waveform;
    this.amount = amount;
    this.sampleRate = sampleRate;
    this.enabled = enabled;
    this.state = {
      phase: 0,
      lastValue: 0,
      lastRandomValue: 0,
      randomPhase: 0
    };
  }

  setFrequency(freq: number): void {
    this.frequency = freq;
  }

  setWaveform(waveform: LFOWaveformType): void {
    this.waveform = waveform;
  }

  setAmount(amount: number): void {
    this.amount = amount;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if this LFO is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Process one sample and return the current LFO value
   */
  process(): number {
    if (!this.enabled) return 0;

    // Calculate phase increment based on frequency and sample rate
    const phaseIncrement = this.frequency / this.sampleRate;

    // Update phase
    this.state.phase = (this.state.phase + phaseIncrement) % 1.0;

    // Calculate LFO value
    const result = calculateLFOValue(
      this.waveform,
      this.state.phase,
      this.state.lastRandomValue,
      this.state.randomPhase
    );

    this.state.lastValue = result.value;
    this.state.lastRandomValue = result.lastRandomValue;
    this.state.randomPhase = result.randomPhase;

    // Scale by amount
    return this.state.lastValue * this.amount;
  }

  /**
   * Get the current value without updating the phase
   */
  getCurrentValue(): number {
    if (!this.enabled) return 0;

    // For display purposes, ensure we're returning oscillating values
    // even when not processing
    const now = Date.now() / 1000; // Current time in seconds
    const phase = (now * this.frequency) % 1.0;

    const result = calculateLFOValue(
      this.waveform,
      phase,
      this.state.lastRandomValue,
      this.state.randomPhase
    );

    return result.value * this.amount;
  }
}
