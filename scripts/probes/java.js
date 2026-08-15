'use strict';

/** Java probe. */
const path = require('path');
const { IS_WINDOWS, Probe, ProbeResult, fileExists } = require('./base');

class JavaProbe extends Probe {
  name = 'java';
  aliases = ['jdk', 'javac'];
  description = 'Java runtime/JDK and JAVA_HOME';

  async check() {
    const onPath = this.which('java');
    const javaHome = this.env('JAVA_HOME');

    const homeTool = (binary) => {
      if (!javaHome) return null;
      const exe = path.join(javaHome, 'bin', binary + (IS_WINDOWS ? '.exe' : ''));
      return fileExists(exe) ? exe : null;
    };

    const homeExe = homeTool('java');
    if (!onPath && !homeExe) {
      return new ProbeResult({
        name: this.name,
        status: 'missing',
        details: { JAVA_HOME: javaHome || 'not set' },
      });
    }

    const exe = onPath || homeExe;
    const res = await this.run([exe, '-version']); // prints on stderr — CmdResult.output covers it
    let version = null;
    if (res) {
      const m = res.output.match(/version "([^"]+)"/);
      version = m ? m[1] : res.version();
    }

    const javac = this.which('javac') || homeTool('javac');
    const details = {
      'javac (JDK)': Boolean(javac),
      JAVA_HOME: javaHome || 'not set',
    };
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version,
      path: exe,
      details,
    });
  }
}

module.exports = JavaProbe;
