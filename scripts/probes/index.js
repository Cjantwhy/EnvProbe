'use strict';

/**
 * EnvProbe probe plugins (auto-discovered).
 *
 * Every module in this directory that exports a concrete Probe subclass is
 * discovered automatically — drop a file in and it registers itself. See
 * references/EXTENDING.md in the skill root for a tutorial.
 */
const fs = require('fs');
const path = require('path');

const base = require('./base');
const { Probe, register, allProbes } = base;

// Modules that are infrastructure, not plugins.
const SKIP = new Set(['base.js', 'runner.js', 'index.js']);

let discovered = false;

/**
 * Load every plugin module here and register its Probe subclasses.
 * Idempotent: repeated calls reuse the registry unless `force` is true.
 * A module that fails to load only produces a stderr warning.
 */
function discoverProbes(force = false) {
  if (discovered && !force) return allProbes();

  for (const file of fs.readdirSync(__dirname).sort()) {
    if (!file.endsWith('.js') || SKIP.has(file) || file.startsWith('_')) continue;
    let mod;
    try {
      mod = require(path.join(__dirname, file));
    } catch (err) {
      process.stderr.write(
        `envprobe: warning: cannot load probe module '${file}': ${err.message}\n`
      );
      continue;
    }
    const candidates = Array.isArray(mod) ? mod : [mod];
    for (const cls of candidates) {
      if (typeof cls !== 'function') continue;
      if (cls === Probe || !(cls.prototype instanceof Probe)) continue;
      register(cls);
    }
  }

  discovered = true;
  return allProbes();
}

module.exports = { discoverProbes, ...base };
