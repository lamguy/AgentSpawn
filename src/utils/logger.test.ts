import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger, logger } from './logger.js';

describe('Logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info() logs when level is info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const l = new Logger('info');
    l.info('hello');
    expect(spy).toHaveBeenCalledWith('hello');
  });

  it('debug() does NOT log when level is info', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const l = new Logger('info');
    l.debug('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('error() always logs regardless of level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const l = new Logger('error');
    l.error('critical failure');
    expect(spy).toHaveBeenCalledWith('critical failure');
  });

  it('warn() logs when level is warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const l = new Logger('warn');
    l.warn('caution');
    expect(spy).toHaveBeenCalledWith('caution');
  });

  it('debug() logs when level is debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const l = new Logger('debug');
    l.debug('trace info');
    expect(spy).toHaveBeenCalledWith('trace info');
  });

  it('warn() does NOT log when level is error', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const l = new Logger('error');
    l.warn('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('info() does NOT log when level is warn', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const l = new Logger('warn');
    l.info('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('should default to info level for unknown level strings', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const l = new Logger('nonsense');
    l.debug('hidden');
    l.info('visible');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('visible');
  });

  it('should pass extra arguments to console methods', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const l = new Logger('info');
    l.info('count:', 42, { key: 'val' });
    expect(spy).toHaveBeenCalledWith('count:', 42, { key: 'val' });
  });

  describe('setSilent', () => {
    it('setSilent(true) suppresses all log levels', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const l = new Logger('debug');
      l.setSilent(true);

      l.info('should not appear');
      l.warn('should not appear');
      l.error('should not appear');
      l.debug('should not appear');

      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('setSilent(false) restores logging', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const l = new Logger('info');
      l.setSilent(true);
      l.info('silenced');
      expect(infoSpy).not.toHaveBeenCalled();

      l.setSilent(false);
      l.info('restored');
      expect(infoSpy).toHaveBeenCalledWith('restored');
    });

    it('setSilent(true) called twice is idempotent', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const l = new Logger('info');
      l.setSilent(true);
      l.setSilent(true);

      l.info('still silent');
      l.error('still silent');

      expect(infoSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('singleton logger export', () => {
    it('should be an instance of Logger', () => {
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should not throw when calling any log method', () => {
      // Suppress console output during this test
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => logger.debug('test debug')).not.toThrow();
      expect(() => logger.info('test info')).not.toThrow();
      expect(() => logger.warn('test warn')).not.toThrow();
      expect(() => logger.error('test error')).not.toThrow();
    });

    it('should not throw when called with extra arguments', () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => logger.info('msg', { extra: true })).not.toThrow();
      expect(() => logger.error('msg', new Error('test'))).not.toThrow();
    });
  });
});
