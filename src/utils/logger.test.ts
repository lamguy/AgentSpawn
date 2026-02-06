import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger } from './logger.js';

describe('Logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info() logs when level is info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger('info');
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith('hello');
  });

  it('debug() does NOT log when level is info', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = new Logger('info');
    logger.debug('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('error() always logs regardless of level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger('error');
    logger.error('critical failure');
    expect(spy).toHaveBeenCalledWith('critical failure');
  });

  it('warn() logs when level is warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new Logger('warn');
    logger.warn('caution');
    expect(spy).toHaveBeenCalledWith('caution');
  });
});
