'use strict';

/** Go probe. */
const { Probe, ProbeResult } = require('./base');

class GoProbe extends Probe {
  name = 'go';
  aliases = ['golang'];
  description = 'Go toolchain';

  async check() {
    const path = this.which('go');
    if (!path) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }
    const res = await this.run(['go', 'version']); // "go version go1.22.5 windows/amd64"
    let version = null;
    if (res) {
      const m = res.output.match(/\bgo(\d+(?:\.\d+)+)/);
      version = m ? m[1] : res.version();
    }
    return new ProbeResult({ name: this.name, status: 'installed', version, path });
  }
}

module.exports = GoProbe;
