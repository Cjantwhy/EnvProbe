'use strict';

/** Redis probe. */
const { Probe, ProbeResult } = require('./base');

const HOST = '127.0.0.1';
const PORT = 6379;

class RedisProbe extends Probe {
  name = 'redis';
  aliases = ['redis-server', 'redis-cli'];
  description = 'Redis binaries and local server reachability';

  async check() {
    const server = this.which('redis-server');
    const client = this.which('redis-cli');
    const memurai = this.which('memurai');
    const listening = await this.portOpen(HOST, PORT);

    if (!server && !client && !memurai) {
      if (listening) {
        // Nothing on PATH, but something answers on 6379 (Docker/WSL/...).
        return new ProbeResult({
          name: this.name,
          status: 'installed',
          details: { [`reachable at ${HOST}:${PORT}`]: 'yes (binaries not on PATH)' },
        });
      }
      return new ProbeResult({ name: this.name, status: 'missing' });
    }

    let version = null;
    let exePath = null;
    for (const cmd of ['redis-server', 'memurai', 'redis-cli']) {
      const exe = this.which(cmd);
      if (!exe) continue;
      const res = await this.run([cmd, '--version']);
      exePath = exe;
      if (res) {
        version = res.version();
        if (version) break;
      }
    }

    const details = {
      'redis-server': Boolean(server),
      'redis-cli': Boolean(client),
      [`listening (${HOST}:${PORT})`]: listening,
    };
    if (memurai) details.memurai = 'found (Windows-native Redis compatible)';
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version,
      path: exePath,
      details,
    });
  }
}

module.exports = RedisProbe;
