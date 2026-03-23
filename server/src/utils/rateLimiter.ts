export class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(
    private maxPerSecond: number,
    private minDelayMs: number = 0
  ) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxPerSecond) {
      this.running++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    setTimeout(() => {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }, this.minDelayMs || (1000 / this.maxPerSecond));
  }

  async wrap<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
