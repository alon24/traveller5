import { useRef, useCallback } from 'react';
import { getGtfsRoutes } from '../services/api/gtfsRoutes';
import { getLineRefsForStopAndLine } from '../services/api/stride';

const MAX_CONCURRENT = 2;

async function doResolve(lineRef, dest, stopCode, signal) {
  if (stopCode) {
    try {
      const lineRefs = await getLineRefsForStopAndLine(stopCode, lineRef, signal);
      if (lineRefs?.length) return `gtfs:${lineRefs[0]}`;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }
  }
  if (!dest) return `mot-line:${lineRef}`;
  try {
    // getGtfsRoutes is a cached module-level promise — no network call after first load
    const routes = await getGtfsRoutes();
    const destNorm = dest.trim().replace(/['"]/g, '').toLowerCase();
    const match = routes
      .filter(r => r.ref === lineRef)
      .find(r => {
        const toNorm = (r.to || '').replace(/['"]/g, '').toLowerCase();
        return toNorm && (toNorm.includes(destNorm) || destNorm.includes(toNorm));
      });
    return match ? `gtfs:${match.routeId}` : `mot-line:${lineRef}`;
  } catch {
    return `mot-line:${lineRef}`;
  }
}

/**
 * Resolves relIds on demand with:
 *  - max 2 concurrent Stride requests
 *  - AbortController per key (re-clicking cancels the previous attempt)
 *  - session-level cache so the same stop+line is never fetched twice
 */
export function useRelIdResolver() {
  const cache = useRef(new Map());       // key → relId (resolved)
  const controllers = useRef(new Map()); // key → AbortController (in-flight)
  const active = useRef(0);
  const waitQueue = useRef([]);

  const resolve = useCallback(async (stopRef, lineRef, dest) => {
    const key = `${stopRef}:${lineRef}`;

    if (cache.current.has(key)) return cache.current.get(key);

    // Cancel any previous in-flight attempt for this key
    controllers.current.get(key)?.abort();
    const ctrl = new AbortController();
    controllers.current.set(key, ctrl);

    // Semaphore: wait for a free slot
    if (active.current >= MAX_CONCURRENT) {
      await new Promise(res => waitQueue.current.push(res));
    }
    if (ctrl.signal.aborted) return null;

    active.current++;
    try {
      const relId = await doResolve(lineRef, dest, stopRef, ctrl.signal);
      if (!ctrl.signal.aborted) {
        cache.current.set(key, relId);
        return relId;
      }
      return null;
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('relId resolve error', e);
      return null;
    } finally {
      active.current--;
      waitQueue.current.shift()?.();
    }
  }, []); // stable — all state is in refs

  return resolve;
}
