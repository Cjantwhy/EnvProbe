'use strict';

/** Docker CLI / engine probe. */
const { Probe, ProbeResult } = require('./base');

class DockerProbe extends Probe {
  name = 'docker';
  aliases = ['docker-compose'];
  description = 'Docker CLI, engine status, and compose plugin';
  timeout = 20000; // `docker info` can be slow while the engine warms up

  async check() {
    const path = this.which('docker');
    if (!path) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }

    const res = await this.run(['docker', '--version']);
    const details = { engine: await this.engineState() };

    const compose = await this.run(['docker', 'compose', 'version', '--short']);
    if (compose && compose.ok) {
      details.compose = `v2 (${compose.output})`;
    } else if (this.has('docker-compose')) {
      details.compose = 'legacy docker-compose on PATH';
    } else {
      details.compose = 'not installed';
    }

    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version: res ? res.version() : null,
      path,
      details,
    });
  }

  async engineState() {
    const info = await this.run(['docker', 'info', '--format', '{{.ServerVersion}}']);
    if (info === null) return 'not responding (launch failed)';
    if (info.timedOut) return 'not responding (timed out)';
    if (info.ok) return `running (server ${info.output})`;
    return 'not running';
  }
}

module.exports = DockerProbe;
