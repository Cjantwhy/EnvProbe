'use strict';

/** PostgreSQL probe. */
const fs = require('fs');
const path = require('path');
const { IS_WINDOWS, Probe, ProbeResult, fileExists } = require('./base');

const HOST = '127.0.0.1';
const PORT = 5432;

class PostgresProbe extends Probe {
  name = 'postgres';
  aliases = ['postgresql', 'psql'];
  description = 'PostgreSQL client/server tools and local service reachability';

  async check() {
    const psql = this.which('psql');
    const server = this.which('postgres') || this.which('pg_ctl');
    const installDir = this.windowsInstallDir();
    const listening = await this.portOpen(HOST, PORT);

    if (!psql && !server && !installDir && !listening) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }

    let version = null;
    let exePath = null;
    if (psql) {
      const res = await this.run(['psql', '--version']);
      version = res ? res.version() : null;
      exePath = psql;
    } else if (installDir) {
      // psql not on PATH (typical on Windows), use the install dir copy.
      const exe = path.join(installDir, 'bin', 'psql.exe');
      const res = await this.run([exe, '--version']);
      version = res ? res.version() : null;
      exePath = exe;
    }

    const details = {
      'psql (client)': Boolean(psql),
      'server binaries': Boolean(server),
      [`listening (${HOST}:${PORT})`]: listening,
    };
    if (installDir) details['install dir'] = installDir;
    if (listening && !psql && !server && !installDir) {
      details.note = 'reachable but no local binaries (Docker/remote?)';
    }
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version,
      path: exePath,
      details,
    });
  }

  /** Highest-version PostgreSQL install dir under Program Files, if any. */
  windowsInstallDir() {
    if (!IS_WINDOWS) return null;
    const base = path.join(this.env('ProgramFiles') || 'C:\\Program Files', 'PostgreSQL');
    if (!fs.existsSync(base)) return null;
    try {
      const dirs = fs
        .readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fileExists(path.join(base, d.name, 'bin', 'psql.exe')))
        .map((d) => path.join(base, d.name));
      if (dirs.length === 0) return null;
      const versionOf = (dir) => {
        const nums = path.basename(dir).split('.').map((n) => parseInt(n, 10) || 0);
        return nums;
      };
      dirs.sort((a, b) => {
        const va = versionOf(a);
        const vb = versionOf(b);
        for (let i = 0; i < Math.max(va.length, vb.length); i++) {
          const d = (vb[i] || 0) - (va[i] || 0); // descending
          if (d !== 0) return d;
        }
        return 0;
      });
      return dirs[0];
    } catch {
      return null;
    }
  }
}

module.exports = PostgresProbe;
