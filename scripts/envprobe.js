#!/usr/bin/env node
'use strict';

/**
 * EnvProbe — parallel development-environment probing for coding agents.
 *
 * Probes are plugin classes living in `probes/`; each one knows how to check
 * a single tool or service (python, docker, redis, ...). The selected probes
 * run in parallel and results are printed as readable text (or JSON).
 *
 * Usage:
 *   node envprobe.js                  # probe everything
 *   node envprobe.js python redis     # probe a subset (names or aliases)
 *   node envprobe.js --list           # list available probes
 *   node envprobe.js --json docker    # machine-readable output
 *
 * Exit codes: 0 = report produced; 2 = CLI misuse.
 */
const { discoverProbes, knownNames, lookup, allProbes, ProbeResult } = require('./probes');
const { runProbes } = require('./probes/runner');

/* -------------------------------------------------------------------- usage */

function printUsage() {
  const lines = [
    'usage: node envprobe.js [names...] [options]',
    '',
    '  probes the local development environment in parallel',
    '',
    'options:',
    '  --list        list available probes and exit',
    '  --json        emit a JSON report',
    '  --jobs N      max parallel probes (default: auto)',
    '  -h, --help    show this help',
  ];
  console.log(lines.join('\n'));
}

function parseArgs(argv) {
  const opts = { names: [], list: false, json: false, jobs: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') opts.list = true;
    else if (a === '--json') opts.json = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--jobs' || a.startsWith('--jobs=')) {
      const raw = a === '--jobs' ? argv[++i] : a.slice('--jobs='.length);
      const v = parseInt(raw, 10);
      if (!Number.isFinite(v) || v < 1) {
        throw new Error(`invalid value for --jobs: ${raw}`);
      }
      opts.jobs = v;
    } else if (a.startsWith('--')) {
      throw new Error(`unknown option: ${a}`);
    } else {
      opts.names.push(a);
    }
  }
  return opts;
}

/* --------------------------------------------------------------- formatting */

function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatProbeList() {
  const lines = ['available probes:', ''];
  for (const [name, cls] of allProbes()) {
    let inst = null;
    try {
      inst = new cls();
    } catch {}
    const aliases = inst && inst.aliases && inst.aliases.length ? `  [${inst.aliases.join(', ')}]` : '';
    const desc = inst && inst.description ? ` - ${inst.description}` : '';
    lines.push(`  ${name.padEnd(16)}${aliases}${desc}`);
  }
  lines.push('', 'run without arguments to probe everything.');
  return lines.join('\n');
}

function formatText(results, durationMs) {
  const lines = [];
  for (const r of results) {
    let head = `[${String(r.status).padEnd(9)}] ${r.name}`;
    if (r.version) head += `  ${r.version}`;
    lines.push(head);
    if (r.path) lines.push(`    path: ${r.path}`);
    for (const [key, value] of Object.entries(r.details || {})) {
      lines.push(`    ${key}: ${formatValue(value)}`);
    }
    if (r.error) lines.push(`    error: ${r.error}`);
    lines.push('');
  }
  const installed = results.filter((r) => r.status === 'installed').length;
  const missing = results.filter((r) => r.status === 'missing').length;
  const errored = results.filter((r) => r.status === 'error').length;
  lines.push(
    `summary: ${installed} installed, ${missing} missing, ${errored} error - ` +
      `${results.length} probes in ${(durationMs / 1000).toFixed(1)}s (parallel)`
  );
  return lines.join('\n');
}

/* ------------------------------------------------------------ name matching */

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function closestHint(raw) {
  let best = null;
  let bestDist = Infinity;
  for (const name of knownNames()) {
    const d = editDistance(raw.toLowerCase(), name);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return bestDist <= Math.max(2, Math.floor(raw.length / 2)) ? best : null;
}

function unknownResult(raw) {
  const hint = closestHint(raw);
  return new ProbeResult({
    name: raw.toLowerCase(),
    status: 'error',
    error: `unknown probe${hint ? ` (did you mean '${hint}'?)` : ''}`,
  });
}

/* --------------------------------------------------------------------- main */

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`envprobe: ${err.message}\n\n`);
    printUsage();
    return 2;
  }
  if (opts.help) {
    printUsage();
    return 0;
  }

  discoverProbes();

  if (opts.list) {
    console.log(formatProbeList());
    return 0;
  }

  const unknown = [];
  let classes = [];
  if (opts.names.length > 0) {
    for (const raw of opts.names) {
      const cls = lookup(raw);
      if (cls === null) unknown.push(raw);
      else if (!classes.includes(cls)) classes.push(cls);
    }
  } else {
    classes = [...allProbes().values()];
  }

  const start = Date.now();
  const results = await runProbes(classes, { maxConcurrency: opts.jobs });
  const duration = Date.now() - start;
  results.push(...unknown.map(unknownResult));

  if (opts.json) {
    const report = {
      tool: 'envprobe',
      duration_ms: duration,
      summary: {
        installed: results.filter((r) => r.status === 'installed').length,
        missing: results.filter((r) => r.status === 'missing').length,
        error: results.filter((r) => r.status === 'error').length,
        total: results.length,
      },
      probes: results.map((r) => r.toJSON()),
    };
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatText(results, duration));
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`envprobe: unexpected failure: ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 1;
  });
