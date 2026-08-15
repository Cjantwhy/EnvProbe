'use strict';

/** MySQL / MariaDB probe. */
const fs = require('fs');
const path = require('path');
const { IS_WINDOWS, Probe, ProbeResult, fileExists } = require('./base');

const HOST = '127.0.0.1';
const PORT = 3306;

class MySqlProbe extends Probe {
  name = 'mysql';
  aliases = ['mariadb', 'mysqld'];
  description = 'MySQL/MariaDB client/server tools and local service reachability';

  async check() {
    const client = this.which('mysql');
    const server = this.which('mysqld') || this.which('mariadbd');
    const installDir = this.windowsInstallDir();
    const listening = await this.portOpen(HOST, PORT);

    if (!client && !server && !installDir && !listening) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }

    let version = null;
    let exePath = null;
    const exe = client || (installDir ? path.join(installDir, 'bin', 'mysql.exe') : null);
    if (exe) {
      const res = await this.run([exe, '--version']);
      if (res) version = this.parseVersion(res.output);
      exePath = exe;
    }

    const details = {
      'mysql (client)': Boolean(client),
      'server binaries': Boolean(server),
      [`listening (${HOST}:${PORT})`]: listening,
    };
    if (installDir) details['install dir'] = installDir;
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version,
      path: exePath,
      details,
    });
  }

  parseVersion(output) {
    // "mysql  Ver 8.0.36 for Win64" / "Ver 15.1 Distrib 10.11.6-MariaDB"
    let m = output.match(/Distrib\s+([\w.\-]+)/);
    let version = m ? m[1] : null;
    if (version === null) {
      m = output.match(/Ver\s+(\d+(?:\.\d+)+)/);
      version = m ? m[1] : null;
    }
    if (version && /mariadb/i.test(output)) version += ' (MariaDB)';
    return version;
  }

  windowsInstallDir() {
    if (!IS_WINDOWS) return null;
    const base = path.join(this.env('ProgramFiles') || 'C:\\Program Files', 'MySQL');
    if (!fs.existsSync(base)) return null;
    try {
      const dirs = fs
        .readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fileExists(path.join(base, d.name, 'bin', 'mysql.exe')))
        .map((d) => path.join(base, d.name));
      if (dirs.length === 0) return null;
      dirs.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
      return dirs[0];
    } catch {
      return null;
    }
  }
}

module.exports = MySqlProbe;
