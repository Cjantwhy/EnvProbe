# Writing EnvProbe Plugins

A probe is any concrete subclass of `probes/base.js`'s `Probe`, exported from
a module inside `scripts/probes/`. Discovery is automatic: at startup every
non-underscore `.js` module except `base.js` / `runner.js` / `index.js` is
loaded, and each exported `Probe` subclass is registered under its `name`
and `aliases`. No registration code, no config files.

## Minimal example — `scripts/probes/ffmpeg.js`

```js
'use strict';
const { Probe, ProbeResult } = require('./base');

class FFmpegProbe extends Probe {
  name = 'ffmpeg';
  aliases = ['ffprobe'];
  description = 'FFmpeg audio/video tools';

  async check() {
    const path = this.which('ffmpeg');
    if (!path) {
      return new ProbeResult({ name: this.name, status: 'missing' });
    }
    const res = await this.run(['ffmpeg', '-version']);
    return new ProbeResult({
      name: this.name,
      status: 'installed',
      version: res ? res.version() : null,
      path,
      details: { ffprobe: this.has('ffprobe') },
    });
  }
}

module.exports = FFmpegProbe;
```

Test it:

```bash
node scripts/envprobe.js --list    # ffmpeg now appears
node scripts/envprobe.js ffmpeg
```

A module may also export an array of classes to register several probes at
once.

## The `Probe` base class API

Set these as instance fields on your subclass:

| Field | Purpose |
|---|---|
| `name` (required) | canonical id, lowercase, used on the CLI |
| `aliases` | extra CLI names that resolve to this probe |
| `description` | one-liner shown by `--list` |
| `timeout` | per-subprocess default in **milliseconds** (default 10000) |

Methods available inside `check()`:

| Method | Purpose |
|---|---|
| `async check()` (implement) | gathers facts, returns a `ProbeResult` |
| `this.which(cmd)` | cached PATH/PATHEXT lookup; resolved path or null |
| `this.has(cmd)` | bool shorthand for `which` |
| `this.env(name)` | environment variable value or null |
| `async this.run(argv, opts?)` | runs `argv` (e.g. `['git', '--version']`), **never rejects**; bare names are resolved through PATH/PATHEXT first, and Windows `.cmd`/`.bat` shims (npm, pnpm, ...) are routed through the shell with proper quoting; resolves to `null` when the executable cannot be launched; `opts.timeout` overrides the class default |
| `async this.portOpen(host, port, timeoutMs?)` | TCP reachability check (1s default) |

`CmdResult` helpers:

- `.ok` — exit code was 0
- `.output` — stdout + stderr combined (handles `java -version` printing to stderr)
- `.version(pattern?)` — first regex match in the combined output. Default
  pattern matches `1.2.3`-style versions. If your pattern has capture
  groups, group 1 is returned; otherwise the whole match (`m[0]`).

## `ProbeResult`

Constructed with a single options object:

```js
new ProbeResult({
  name: this.name,          // your probe's canonical name
  status: 'installed',      // "installed" | "missing" | "error"
  version: '1.2.3',         // best-known version string (optional)
  path: '/usr/bin/tool',    // primary executable path (optional)
  details: { key: value },  // rendered as "key: value" lines (optional)
  error: '...',             // failure explanation, status="error" only
});
```

A probe is "installed" when the thing it checks is usable locally — that may
mean a binary on PATH, an install directory, or a reachable port (e.g. Redis
running in Docker). Use `details` to convey which case applies. `details`
values render as `yes`/`no` for booleans, `n/a` for null.

## Parallelism rules

- `check()` runs on a promise worker pool; all selected probes run
  concurrently (default cap 32, `--jobs N` to override).
- Keep `check()` self-contained and non-interactive: no prompts, no side
  effects, no long blocking calls without a timeout.
- Rejections and exceptions never escape: the runner converts them into
  `status: "error"` results, so one broken plugin degrades gracefully.

## Conventions

- Report facts (versions, paths, ports, flags), not advice.
- One concern per probe; split families if they warrant separate queries
  (e.g. `postgres` vs `mysql`).
- Registering a duplicate name/alias warns on stderr; the first
  registration wins, so load order (alphabetical module discovery) decides.
