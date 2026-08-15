'use strict';

/** Rust probe. */
const { Probe, ProbeResult } = require('./base');

class RustProbe extends Probe {
  name = 'rust';
  aliases = ['cargo', 'rustc'];
  description = 'Rust toolchain (cargo, rustc)';

  async check() {
    const cargo = this.which('cargo');
    const rustc = this.which('rustc');
    if (!cargo && !rustc) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }

    let version = null;
    let exePath = null;
    const details = {};
    if (cargo) {
      const res = await this.run(['cargo', '--version']);
      version = res ? res.version() : null;
      exePath = cargo;
    }
    if (rustc) {
      const res = await this.run(['rustc', '--version']);
      details.rustc = res ? res.version() : 'unknown';
    }
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version,
      path: exePath,
      details,
    });
  }
}

module.exports = RustProbe;
