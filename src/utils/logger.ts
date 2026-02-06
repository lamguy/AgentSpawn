const LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private readonly threshold: number;

  constructor(level: string = 'info') {
    this.threshold = LEVELS[level] ?? LEVELS.info;
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.threshold <= LEVELS.debug) {
      console.debug(msg, ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.threshold <= LEVELS.info) {
      console.info(msg, ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.threshold <= LEVELS.warn) {
      console.warn(msg, ...args);
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.threshold <= LEVELS.error) {
      console.error(msg, ...args);
    }
  }
}
