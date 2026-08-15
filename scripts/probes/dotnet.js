'use strict';

/** .NET probe. */
const { Probe, ProbeResult } = require('./base');

class DotNetProbe extends Probe {
  name = 'dotnet';
  aliases = ['.net'];
  description = '.NET SDK and runtimes';
  timeout = 20000;

  async check() {
    const path = this.which('dotnet');
    if (!path) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }

    const res = await this.run(['dotnet', '--version']);
    const details = {};
    if (res !== null && !res.ok) {
      details.note = 'runtime present, but `dotnet --version` failed (SDK missing?)';
    }

    const sdks = await this.run(['dotnet', '--list-sdks']);
    if (sdks && sdks.ok) {
      const found = sdks.output
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => line.split('[')[0].trim());
      details.sdks = found.length ? found.join(', ') : 'none (runtime only)';
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

module.exports = DotNetProbe;
