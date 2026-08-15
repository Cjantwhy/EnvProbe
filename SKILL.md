---
name: envprobe
description: Probes the local development environment in parallel and reports installed tools, versions, paths, and running services — python, node, git, docker, docker-desktop, redis, postgres, mysql, java, go, rust, dotnet. Use it when starting a development session, before writing setup/install scripts, or whenever a task depends on specific tools being installed or running.
compatibility: Requires Node.js 16+ (any machine running a coding agent already has it). Zero dependencies, stdlib only. Works on Windows, macOS, and Linux.
---

# EnvProbe

Run `node scripts/envprobe.js` (relative to this skill's directory) to inspect the machine. All requested probes execute **in parallel**; each probe is a small plugin class under `scripts/probes/`, so adding a new check means dropping in one file (see [references/EXTENDING.md](references/EXTENDING.md)). The only runtime requirement is Node.js itself — no `npm install`, no other interpreters.

## Commands

```bash
node scripts/envprobe.js                       # probe everything
node scripts/envprobe.js python redis          # only the named probes
node scripts/envprobe.js psql mysql            # aliases resolve too (-> postgres, mysql)
node scripts/envprobe.js --list                # list probes + aliases
node scripts/envprobe.js --json python docker  # machine-readable JSON report
```

## When to use

- At the start of a dev/setup task: probe exactly the tools the project needs
  (e.g. `node scripts/envprobe.js python redis docker docker-desktop`).
- Before choosing runtimes, writing install scripts, or generating configs
  that depend on tool versions.
- When diagnosing "command not found" or "service not running" issues —
  probes report both binaries and local port reachability.

## Reading results

- Status per probe: `installed`, `missing`, or `error`.
- `version` / `path` give the primary executable found.
- `details` lines carry extras: engine/service state, listening ports,
  package managers, install dirs, active virtualenv, etc.
- Exit code is 0 whenever a report was produced; check statuses, not the
  exit code. Unknown probe names come back as `error` results with a
  "did you mean" hint.

## Extending

Add one JavaScript file with one `Probe` subclass to `scripts/probes/` — it
is auto-discovered on the next run. Full guide with examples:
[references/EXTENDING.md](references/EXTENDING.md).
