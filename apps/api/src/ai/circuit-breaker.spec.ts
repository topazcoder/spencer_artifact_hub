import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let now: number;
  let breaker: CircuitBreaker;

  beforeEach(() => {
    now = 0;
    breaker = new CircuitBreaker(3, 1000, () => now);
  });

  function fail(times: number): boolean[] {
    return Array.from({ length: times }, () => breaker.recordFailure());
  }

  it('allows calls until failures in a row reach the threshold', () => {
    expect(fail(2)).toEqual([false, false]);
    expect(breaker.tryAcquire()).toBe(true);
    expect(fail(1)).toEqual([true]);
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('counts failures in a row only', () => {
    fail(2);
    breaker.recordSuccess();
    fail(2);
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('lets one trial call through after the cool-down', () => {
    fail(3);
    now = 999;
    expect(breaker.tryAcquire()).toBe(false);
    now = 1000;
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('closes when the trial succeeds', () => {
    fail(3);
    now = 1000;
    breaker.tryAcquire();
    breaker.recordSuccess();
    expect(breaker.tryAcquire()).toBe(true);
    expect(fail(2)).toEqual([false, false]);
  });

  it('opens for another cool-down when the trial fails, without reporting it as newly open', () => {
    fail(3);
    now = 1000;
    breaker.tryAcquire();
    expect(breaker.recordFailure()).toBe(false);
    now = 1999;
    expect(breaker.tryAcquire()).toBe(false);
    now = 2000;
    expect(breaker.tryAcquire()).toBe(true);
  });
});
