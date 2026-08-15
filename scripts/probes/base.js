'use strict';

/**
 * Core building blocks for EnvProbe.
 *
 * - CmdResult   outcome of one subprocess run (never rejects)
 * - ProbeResult what a probe reports
 * - Probe       base class every plugin inherits from
 * - registry    register / lookup / knownNames / allProbes
 */
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const IS_WINDOWS = process.platform === 'win32';

/* ------------------------------------------------------------------ helpers */

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Extensions tried when resolving a bare command name on Windows.
const PATH_EXTS = IS_WINDOWS
  ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .map((e) => e.toLowerCase())
      .filter(Boolean)
  : [''];

function quoteForCmd(arg) {
  if (!/[\s"&|<>^]/.test(arg)) return arg;
  return '"' + arg.replace(/"/g, '""') + '"';
}

/* ---------------------------------------------------------------- CmdResult */

class CmdResult {
  /**
   * Outcome of one subprocess execution. `run()` never rejects: a command
   * that cannot be launched at all resolves to null; everything else is
   * described here. `code` is the exit code (null when unknown/timed out).
   */
  constructor(argv, code, stdout = '', stderr = '', timedOut = false) {
    this.argv = argv;
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
    this.timedOut = timedOut;
  }

  get ok() {
    return this.code === 0;
  }

  /** stdout + stderr combined (handles `java -version` and friends). */
  get output() {
    return `${this.stdout}\n${this.stderr}`.trim();
  }

  /**
   * First regex match in the combined output (default: 1.2.3-style).
   * When the pattern has capture groups, group 1 is returned; otherwise
   * the whole match (m[0]) is.
   */
  version(pattern = /\d+(?:\.\d+)+/) {
    const m = this.output.match(pattern);
    if (!m) return null;
    return m.length > 1 ? m[1] : m[0];
  }
}

/* -------------------------------------------------------------- ProbeResult */

class ProbeResult {
  /**
   * A probe's findings. `status` is one of "installed", "missing", "error".
   */
  constructor({ name, status, version = null, path = null, details = {}, error = null }) {
    this.name = name;
    this.status = status;
    this.version = version;
    this.path = path;
    this.details = details || {};
    this.error = error;
  }

  toJSON() {
    return {
      name: this.name,
      status: this.status,
      version: this.version,
      path: this.path,
      details: this.details,
      error: this.error,
    };
  }
}

/* -------------------------------------------------------------------- Probe */

class Probe {
  /**
   * Base class for all environment probes (the "plugin" contract).
   *
   * Subclass it, set `name` (plus optional `aliases` / `description`),
   * implement an async `check()`, and drop the module into the `probes`
   * directory — it is discovered and registered automatically.
   */
  constructor() {
    this._whichCache = new Map();
  }

  name = '';
  description = '';
  aliases = [];
  timeout = 10000; // ms, per subprocess

  async check() {
    throw new Error('Probe subclasses must implement check()');
  }

  /** Resolved executable path for `cmd` (cached), or null. */
  which(cmd) {
    if (this._whichCache.has(cmd)) return this._whichCache.get(cmd);
    let found = null;
    if (path.isAbsolute(cmd) || /[\\/]/.test(cmd)) {
      // Explicit path given: try as-is, then with PATH extensions appended.
      found = [cmd, ...PATH_EXTS.map((e) => cmd + e)].find(fileExists) || null;
    } else {
      const dirs = String(process.env.PATH || '')
        .split(path.delimiter)
        .filter(Boolean);
      for (const dir of dirs) {
        const hit = PATH_EXTS.map((e) => path.join(dir, cmd + e)).find(fileExists);
        if (hit) {
          found = hit;
          break;
        }
      }
    }
    this._whichCache.set(cmd, found);
    return found;
  }

  /** True when `cmd` resolves on PATH. */
  has(cmd) {
    return this.which(cmd) !== null;
  }

  /** Value of environment variable `name`, or null. */
  env(name) {
    const v = process.env[name];
    return v === undefined ? null : v;
  }

  /**
   * Run a command without ever rejecting.
   *
   * Bare command names are resolved through PATH/PATHEXT first; `.cmd`/`.bat`
   * shims (npm, pnpm, ...) are routed through the shell with quoting because
   * Node refuses to spawn them directly.
   *
   * Resolves to null when the executable cannot be launched at all; timeouts
   * are reported via `CmdResult.timedOut`.
   */
  async run(argv, opts = {}) {
    if (!Array.isArray(argv) || argv.length === 0) return null;
    const timeout =
      opts.timeout != null ? opts.timeout : this.timeout != null ? this.timeout : 10000;
    const [rawCmd, ...args] = argv;
    let target = rawCmd;
    if (!path.isAbsolute(rawCmd) && !/[\\/]/.test(rawCmd)) {
      target = this.which(rawCmd) || rawCmd;
    }

    let child;
    try {
      if (IS_WINDOWS && /\.(cmd|bat)$/i.test(target)) {
        const line = quoteForCmd(target) + (args.length ? ' ' + args.map(quoteForCmd).join(' ') : '');
        child = spawn(line, { shell: true, windowsHide: true });
      } else {
        child = spawn(target, args, { windowsHide: true });
      }
    } catch {
      return null;
    }

    return await new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let code = null;
      let timedOut = false;
      let launchError = null;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch {}
      }, timeout);

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (launchError && code === null && !timedOut) {
          resolve(null); // could not be launched at all
          return;
        }
        resolve(new CmdResult(argv, code, stdout, stderr, timedOut));
      };

      if (child.stdout) child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
      if (child.stderr) child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
      child.on('error', (e) => {
        launchError = e;
        finish();
      });
      child.on('close', (c) => {
        code = c;
        finish();
      });
    });
  }

  /** True when a TCP connection to `host:port` succeeds. */
  async portOpen(host, port, timeoutMs = 1000) {
    return await new Promise((resolve) => {
      const socket = new net.Socket();
      const done = (ok) => {
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });
  }
}

/* ----------------------------------------------------------------- registry */

const REGISTRY = new Map(); // lowercase name/alias -> Probe subclass

/**
 * Register a Probe subclass under its `name` and `aliases` (instance fields,
 * read off a throwaway instance). The first registration for a key wins;
 * later duplicates only warn on stderr, so one conflicting plugin cannot
 * take the whole tool down.
 */
function register(cls) {
  let inst = null;
  try {
    inst = new cls();
  } catch {
    return;
  }
  const name = String(inst.name || '').toLowerCase();
  if (!name) return;
  const aliases = (inst.aliases || []).map((a) => String(a).toLowerCase());

  for (const key of [name, ...aliases]) {
    const existing = REGISTRY.get(key);
    if (existing && existing !== cls) {
      process.stderr.write(
        `envprobe: warning: probe name '${key}' already registered by ${existing.name}; ` +
          `ignoring ${cls.name}\n`
      );
      continue;
    }
    REGISTRY.set(key, cls);
  }
}

/** Resolve a name or alias (case-insensitive) to a Probe subclass. */
function lookup(name) {
  return REGISTRY.get(String(name).toLowerCase()) || null;
}

/** All registered keys (names + aliases), sorted. */
function knownNames() {
  return [...REGISTRY.keys()].sort();
}

/** Canonical name -> Probe subclass, sorted by name (aliases excluded). */
function allProbes() {
  const out = new Map();
  for (const cls of new Set(REGISTRY.values())) {
    try {
      const name = new cls().name;
      if (name) out.set(name, cls);
    } catch {}
  }
  return new Map([...out.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

module.exports = {
  IS_WINDOWS,
  CmdResult,
  ProbeResult,
  Probe,
  fileExists,
  dirExists,
  register,
  lookup,
  knownNames,
  allProbes,
};
