# neon77

A "terminal from 2077" look for [Claude Code](https://claude.com/claude-code): an animated ASCII cat that lives above the prompt and reacts to what the session is doing, a neon theme, and a two-line status line. Works on Windows, Linux and macOS.

```
    |\__/,|   (`\   ░▒▓ NEURAL LINK 34% ▓▒░  ICE 03  UP 00:42:17   ｱｶ7fﾃ3eｻ
  _.|o o  |_   ) )  > jacking into shell ⠹
-(((---(((--------  last turn +12.3k tok · 4 tools · 18s

▓ Fable 5.2 ▓ CTX ████████░░░░ 67% ▓ $0.42 ▓ 00:42:17 ▓ CACHE 91% ▓
▓ main +3 ~2 ▓ EFFORT max ▓ FAST off ▓ 23:41 NIGHT CITY ▓
```

## What is in the box

| Part | What it does | Needs |
| --- | --- | --- |
| **Mod** `neon77` | The cat band above the prompt, cyberpunk spinner verbs and turn-end lines, the `/neon77` command | Claude Code with mods (built on 2.1.322) |
| **Theme** `neon77` | Hot pink, cyan and 2077 yellow across the whole interface | A truecolor terminal |
| **Status line** | Model, context bar, cost, uptime, cache, git branch and changes, effort, fast mode, clock | Node.js 18 or newer; `git` optional |

The three parts are independent: install any of them.

## Install

### 1. The mod

At the prompt of a Claude Code session:

```
/plugin install neon77 --marketplace lngdao/neon77
```

Answer `y` to add the marketplace, then pick a scope (user is the usual one).

Or from a shell:

```sh
claude plugin install neon77 --marketplace lngdao/neon77
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `lngdao/neon77`, then Add plugin. The cat draws in terminal sessions only.

### 2. The theme and the status line

```sh
git clone https://github.com/lngdao/neon77
cd neon77
node install.mjs
```

The same three lines work in PowerShell, cmd, bash and zsh. The installer:

- copies `themes/neon77.json` to `~/.claude/themes/` and sets `"theme": "custom:neon77"`;
- copies `statusline.mjs` to `~/.claude/neon77/` and sets `statusLine` to run it with `node`;
- backs up `settings.json` beside itself first (`settings.json.neon77-backup-<time>`) and leaves every other key alone.

Restart Claude Code afterwards.

| Option | Effect |
| --- | --- |
| `--no-theme` | Status line only |
| `--no-statusline` | Theme only |
| `--dry-run` | Print what would change, change nothing |
| `--uninstall` | Remove both and restore `"theme": "dark"` |

`CLAUDE_CONFIG_DIR` is honoured when you keep your config somewhere other than `~/.claude`.

## Using it

The cat follows the session by itself: it boots, idles, falls asleep after two minutes without a prompt, types while Claude thinks or runs a tool, glitches when a tool fails, dances when a turn ends, and sweats once the context window passes 85%.

```
/neon77            show state and usage
/neon77 on | off   show or hide the cat
/neon77 calm | normal | hyper   animation speed (2x slower, default, 2x faster)
/neon77 pet        wake it up
```

`on`/`off` and the speed are remembered across sessions.

The band adapts to width: under 70 columns it drops the data rain and the last-turn stats, under 45 it keeps the cat and its line only. It is always three rows.

## Platform notes

- **Colour.** The theme and status line use 24-bit colour. Windows Terminal, the VS Code terminal, iTerm2, Ghostty, kitty, WezTerm, Alacritty and GNOME Terminal handle it. The legacy Windows console (`conhost.exe`) and macOS Terminal.app before macOS 26 do not, and show approximate colours.
- **Glyphs.** The cat uses block elements (`▓▒░`), braille spinner frames and half-width katakana. Pick a font that has them: Cascadia Code/Mono, JetBrains Mono, or any Nerd Font. Missing glyphs show as boxes but nothing breaks.
- **Node.** Claude Code's native installer does not ship Node, so the status line needs your own `node` on `PATH` (18+). The mod and the theme do not need it.
- **Git.** Without `git` on `PATH`, or outside a repository, the status line shows `no repo`. Git results are cached for 5 seconds per directory in the system temp folder.
- **Cost** is Claude Code's own estimate; through a proxy or custom model aliases it can be off.

## Uninstall

```sh
claude plugin uninstall neon77
node install.mjs --uninstall
```

## Development

```
.claude-plugin/marketplace.json   makes this repository a plugin marketplace
mods/neon77/                      the mod: manifest, hooks module, its tests
themes/neon77.json                the theme
statusline.mjs                    the status line
install.mjs                       installer for the theme and status line
test/                             Node tests for the two scripts
docs/                             the original design document
```

```sh
node --test test/statusline.test.mjs test/install.test.mjs   # scripts
claude plugin test mods/neon77                               # the mod
claude plugin validate .                                     # marketplace + manifest
claude --plugin-dir mods/neon77                              # run the mod from this folder
```

CI runs the script tests on Ubuntu, macOS and Windows with Node 18 and 24.
