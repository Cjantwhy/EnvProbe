'use strict';

/** Node.js probe. */
const { Probe, ProbeResult } = require('./base');

class NodeJsProbe extends Probe {
  name = 'node';
  aliases = ['nodejs', 'npm'];
  description = 'Node.js runtime plus package managers (npm, pnpm, yarn, bun)';

  async check() {
    const path = this.which('node');
    if (!path) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }
    const res = await this.run(['node', '--version']);
    const details = {};
    for (const tool of ['npm', 'pnpm', 'yarn', 'bun']) {
      details[tool] = (await this.toolVersion(tool)) || 'not installed';
    }
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version: res ? res.version() : null,
      path,
      details,
    });
  }

  async toolVersion(tool) {
    if (!this.which(tool)) return null;
    const res = await this.run([tool, '--version']);
    return res ? res.version() : null;
  }
}

module.exports = NodeJsProbe;
