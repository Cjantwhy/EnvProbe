# EnvProbe

给 Coding Agent 用的开发环境探测 Skill：按需、**并行**地检查本机装了哪些工具、
版本是多少、服务是否在跑。Agent 进入开发阶段时跑一条命令，即可拿到它需要的
环境信息，而不必逐个试错。

**宿主语言是 Node.js**——能跑 Coding Agent（pi / Claude Code 等）的机器必然
有 Node，因此不依赖用户是否安装了 Python 或其他运行时；且实现零依赖
（仅标准库），无需 `npm install`。

## 特性

- **按需查询**：`python redis` 只查这两项；不带参数则全量探测。
- **并行执行**：所有被选中的探测项在 promise worker pool 中同时运行
  （核心由 `scripts/probes/runner.js` 提供）。
- **插件式探测项**：每项检测是一个独立的 `Probe` 子类，放进
  `scripts/probes/` 即被自动发现，无需注册代码。
- **零依赖**：仅用 Node 标准库（16+），Windows / macOS / Linux 通用。
- **双输出**：人类可读文本（默认）与 `--json` 结构化输出。

内置探测项：`python` `node` `git` `docker` `docker-desktop` `redis`
`postgres` `mysql` `java` `go` `rust` `dotnet`（`--list` 可查看全部及别名）。

## 目录结构

```
EnvProbe/
├── SKILL.md                  # Skill 入口（Agent 读取的说明书）
├── README.md
├── references/
│   └── EXTENDING.md          # 插件编写指南
└── scripts/
    ├── envprobe.js           # CLI 入口：解析参数 → 并行执行 → 格式化输出
    └── probes/
        ├── index.js          # 插件自动发现
        ├── base.js           # Probe 基类 / ProbeResult / 注册表
        ├── runner.js         # 并行执行器（promise worker pool）
        ├── python.js         # ┐
        ├── docker.js         # │
        ├── docker-desktop.js # │  每个文件 = 一项（或一族）检测，
        ├── redis.js          # │  新增检测 = 新增一个文件
        └── ...               # ┘
```

## 安装为全局 Skill

把本目录放进 pi 的全局 skill 目录即可（也可复制）：

```powershell
# PowerShell：建目录联接，改代码即时生效
New-Item -ItemType Junction -Path "$env:USERPROFILE\.pi\agent\skills\envprobe" `
  -Target "C:\Users\cjant\Projects\my-projects\EnvProbe"
```

```bash
# git-bash / WSL：直接软链或复制
ln -s "/c/Users/cjant/Projects/my-projects/EnvProbe" ~/.pi/agent/skills/envprobe
```

之后 Agent 会看到 `envprobe` 这个 Skill，并在合适的时机调用它
（也可手动 `/skill:envprobe` 强制加载）。

## 使用

```bash
node scripts/envprobe.js                       # 全量探测
node scripts/envprobe.js python redis          # 只查 python 和 redis
node scripts/envprobe.js psql mysql            # 别名同样有效
node scripts/envprobe.js --list                # 列出探测项
node scripts/envprobe.js --json python docker  # JSON 输出
```

输出示例：

```text
[installed] python  3.14.2
    path: C:\WINDOWS\py.exe
    pip: 26.0.1
[installed] docker  29.7.2
    path: C:\Program Files\Docker\Docker\resources\bin\docker.exe
    engine: not running
    compose: v2 (5.3.1)
[missing  ] mysql

summary: 11 installed, 1 missing, 0 error - 12 probes in 1.5s (parallel)
```

## 扩展

新增一项检测只需在 `scripts/probes/` 下新建一个文件，写一个
`Probe` 子类并实现 `check()`：

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
    });
  }
}

module.exports = FFmpegProbe;
```

保存后 `--list` 即可看到，无需任何注册步骤。基类提供 `which` / `run` /
`portOpen` / `env` 等工具方法，详见
[references/EXTENDING.md](references/EXTENDING.md)。

## 设计要点

- **为什么是 Node**：Skill 的消费场景是“跑 Coding Agent 的机器”，这类机器
  必然装有 Node（pi、Claude Code 等本身就是 Node 应用），因此以 Node 为
  宿主可以做到“零假设、零依赖”，不必担心目标机器没装 Python。
- **并行**：`runner.runProbes()` 用 promise worker pool 并发执行各探测类；
  探测项内部以子进程 / 网络 IO 为主，async 并发即可获得真实加速。单个探测
  抛异常或 reject 只会变成一条 `error` 结果，不影响整批。
- **插件化**：`probes/index.js` 在启动时扫描目录，收集所有具名、非抽象的
  `Probe` 子类并注册（名称 + 别名）。首个注册者胜出，重名仅告警。
- **Windows 稳健性**：裸命令名先经 PATH/PATHEXT 解析成完整路径；`.cmd`/
  `.bat` 垫片（npm、pnpm 等）通过 shell 带引号执行（Node 18.20+ 禁止直接
  spawn 这类文件）；跳过 Microsoft Store 的 python 假 stub；识别
  Program Files 里的 PostgreSQL / MySQL 安装目录。
