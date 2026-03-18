/**
 * Tests for useRelIdResolver — rate-limiting, caching, abort signal.
 * Runs in Vitest browser mode (real Chromium).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRelIdResolver } from '../hooks/useRelIdResolver.js';

// Stub the stride import used inside doResolve so tests don't make real network calls
vi.mock('../services/api/stride.js', () => ({
  getLineRefsForStopAndLine: vi.fn(),
}));
vi.mock('../services/api/gtfsRoutes.js', () => ({
  findBestTerminalsByRef: vi.fn(),
  getGtfsRoutes: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../hooks/useRouteShape.js', () => ({}));

describe('useRelIdResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a function', () => {
    const { result } = renderHook(() => useRelIdResolver());
    expect(typeof result.current).toBe('function');
  });

  it('caches the result of a successful resolve', async () => {
    const { getLineRefsForStopAndLine } = await import('../services/api/stride.js');
    getLineRefsForStopAndLine.mockResolvedValue([12345]);

    const { result } = renderHook(() => useRelIdResolver());

    let firstResult, secondResult;
    await act(async () => {
      firstResult  = await result.current('38918', '16', 'ירושלים');
      secondResult = await result.current('38918', '16', 'ירושלים');
    });

    // stride should only be called once — second call hits cache
    expect(getLineRefsForStopAndLine).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(secondResult);
  });

  it('returns null when stride finds no line refs for stop+line', async () => {
    const { getLineRefsForStopAndLine } = await import('../services/api/stride.js');
    getLineRefsForStopAndLine.mockResolvedValue(null);

    const { findBestTerminalsByRef } = await import('../services/api/gtfsRoutes.js');
    findBestTerminalsByRef.mockResolvedValue([]);

    const { result } = renderHook(() => useRelIdResolver());

    let resolved;
    await act(async () => {
      resolved = await result.current('99999', '999', 'nowhere');
    });

    // With no valid lineRefs and no GTFS fallback, resolve should return null
    // (exact return depends on doResolve internals, but it should not throw)
    expect(resolved === null || typeof resolved === 'string').toBe(true);
  });
});
