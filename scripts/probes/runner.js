'use strict';

/**
 * Parallel execution engine: runs probes on a promise worker pool.
 *
 * `check()` implementations are mostly subprocess / network IO, so
 * cooperative async concurrency gives real speedups. Each task is isolated:
 * an exception becomes an "error" ProbeResult instead of rejecting the
 * whole batch.
 */
const { ProbeResult } = require('./base');

async function executeProbe(cls) {
  const fallbackName = typeof cls === 'function' ? cls.name : 'unknown';
  let probeName = fallbackName;
  try {
    const probe = new cls();
    probeName = probe.name || fallbackName;
    const result = await probe.check();
    if (!(result instanceof ProbeResult)) {
      throw new TypeError(
        `check() returned ${result === null ? 'null' : typeof result}, expected ProbeResult`
      );
    }
    return result;
  } catch (err) {
    const what = err && err.constructor ? err.constructor.name : 'Error';
    const msg = err && err.message ? err.message : String(err);
    return new ProbeResult({ name: probeName, status: 'error', error: `${what}: ${msg}` });
  }
}

/**
 * Run probe classes in parallel; results keep the input order.
 * `opts.maxConcurrency` caps parallelism (default: up to 32).
 */
async function runProbes(classes, opts = {}) {
  const list = [...classes];
  if (list.length === 0) return [];

  const limit = Math.max(1, Math.min(opts.maxConcurrency || 32, list.length));
  const results = new Array(list.length);
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next++; // safe: single-threaded event loop
      if (i >= list.length) return;
      results[i] = await executeProbe(list[i]);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

module.exports = { runProbes };
