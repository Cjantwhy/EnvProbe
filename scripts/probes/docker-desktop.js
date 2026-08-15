'use strict';

/** Docker Desktop probe. */
const path = require('path');
const { IS_WINDOWS, Probe, ProbeResult, fileExists, dirExists } = require('./base');

class DockerDesktopProbe extends Probe {
  name = 'docker-desktop';
  aliases = ['dockerdesktop'];
  description = 'Docker Desktop installation and running state';

  async check() {
    const location = await this.installLocation();
    if (location === null) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      path: location,
      details: { running: await this.isRunning() },
    });
  }

  async installLocation() {
    if (IS_WINDOWS) {
      for (const envKey of ['ProgramFiles', 'LOCALAPPDATA']) {
        const base = this.env(envKey);
        if (!base) continue;
        const exe = path.join(base, 'Docker', 'Docker', 'Docker Desktop.exe');
        if (fileExists(exe)) return exe;
      }
      return null;
    }
    if (process.platform === 'darwin') {
      const app = '/Applications/Docker.app';
      return dirExists(app) ? app : null;
    }
    // Linux: Docker Desktop integrates through a systemd service.
    const active = await this.run(['systemctl', 'is-active', 'docker-desktop'], { timeout: 5000 });
    if (active !== null && active.ok) return "systemd service 'docker-desktop'";
    if (this.has('docker-desktop')) return this.which('docker-desktop');
    return null;
  }

  async isRunning() {
    if (IS_WINDOWS) {
      const task = await this.run([
        'tasklist',
        '/FI',
        'IMAGENAME eq Docker Desktop.exe',
      ]);
      return Boolean(task && task.ok && task.output.toLowerCase().includes('docker desktop.exe'));
    }
    if (process.platform === 'darwin') {
      const task = await this.run(['pgrep', '-f', 'Docker.app'], { timeout: 5000 });
      return Boolean(task && task.ok);
    }
    const active = await this.run(['systemctl', 'is-active', 'docker-desktop'], { timeout: 5000 });
    return Boolean(active && active.ok);
  }
}

module.exports = DockerDesktopProbe;
