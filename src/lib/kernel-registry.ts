import type { DSPKernel } from '../audio/nodes/dsp-kernel';
import * as Kernels from '../audio/nodes';

export class KernelRegistry {
  private registry: Map<string, DSPKernel> = new Map<string, DSPKernel>();

  constructor() {
    this.registerDefaultKernels();
  }

  public register(type: string, kernel: DSPKernel): void {
    if (this.registry.has(type)) {
      console.warn(`Kernel type "${type}" is already registered. Overwriting.`);
    }
    this.registry.set(type, kernel);
  }

  public getKernel(type: string): DSPKernel | undefined {
    if (!this.registry.has(type)) {
      // console.warn(\`Kernel type "${type}" not found in registry.\`);
      return undefined;
    }
    return this.registry.get(type);
  }

  private registerDefaultKernels(): void {
    // Assumes kernel functions are named e.g., processGain, processDelay in ../audio/nodes/index.ts
    // and their corresponding type strings are 'gain', 'delay', etc.
    this.register('gain', Kernels.processGain);
    this.register('delay', Kernels.processDelay);
    this.register('biquad', Kernels.processBiquad);
    this.register('passthrough', Kernels.passthroughKernel); // Corrected from processPassthrough
    this.register('noise', Kernels.noiseKernel);
    // Add other kernels here if they follow the same naming convention
  }

  public getRegisteredTypes(): string[] {
    return Array.from(this.registry.keys());
  }
}

// Export a singleton instance for convenience
export const kernelRegistry = new KernelRegistry();
