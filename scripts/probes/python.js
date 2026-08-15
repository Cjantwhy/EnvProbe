'use strict';

/** Python interpreter probe. */
const { IS_WINDOWS, Probe, ProbeResult } = require('./base');

class PythonProbe extends Probe {
  name = 'python';
  aliases = ['python3', 'py'];
  description = 'Python interpreter, pip, and the active virtual environment';

  // Windows ships fake python.exe stubs here that just open the Microsoft Store.
  static STORE_STUB_MARKER = 'windowsapps';

  async check() {
    const candidates = IS_WINDOWS ? ['py', 'python', 'python3'] : ['python3', 'python'];
    let chosen = null; // { cmd, exePath, version } — verified runnable
    let fallback = null; // found on PATH, but --version failed

    for (const cmd of candidates) {
      const exePath = this.which(cmd);
      if (!exePath) continue;
      const res = await this.run([cmd, '--version']);
      const version = res ? res.version() : null;
      if (version) {
        chosen = { cmd, exePath, version };
        break;
      }
      const isStoreStub =
        IS_WINDOWS && exePath.toLowerCase().replace(/\\/g, '/').includes('windowsapps');
      if (!fallback && !isStoreStub) fallback = { cmd, exePath, version: null };
    }

    const picked = chosen || fallback;
    if (!picked) {
      return new ProbeResult({ name: this.name, status: 'missing', details: this.context() });
    }

    const details = this.context();
    const pip = await this.pipVersion(picked.cmd);
    if (pip) details.pip = pip;
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version: picked.version,
      path: picked.exePath,
      details,
    });
  }

  async pipVersion(cmd) {
    const res = await this.run([cmd, '-m', 'pip', '--version']);
    return res && res.ok ? res.version() : null;
  }

  context() {
    const details = {};
    const venv = this.env('VIRTUAL_ENV');
    if (venv) details.virtualenv = `${venv} (active)`;
    const conda = this.env('CONDA_DEFAULT_ENV');
    if (conda) details['conda env'] = conda;
    return details;
  }
}

module.exports = PythonProbe;
