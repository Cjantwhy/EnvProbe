'use strict';

/** Git probe. */
const { Probe, ProbeResult } = require('./base');

class GitProbe extends Probe {
  name = 'git';
  description = 'Git version control and commit identity';

  async check() {
    const path = this.which('git');
    if (!path) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }
    const res = await this.run(['git', '--version']);
    const details = {};
    for (const key of ['user.name', 'user.email']) {
      const cfg = await this.run(['git', 'config', '--get', key]);
      if (cfg && cfg.ok && cfg.output) details[key] = cfg.output;
    }
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version: res ? res.version() : null,
      path,
      details,
    });
  }
}

module.exports = GitProbe;
