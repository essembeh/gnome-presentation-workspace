# CLAUDE.md — Presentation workspace

`presentation-workspace@essembeh.org` is a GNOME Shell extension for **presenting on a
secondary screen in extended (joined) mode**: workspace 1 of the primary screen shows
a live mirror of the secondary screen, the other workspaces stay private. It replaces
an OBS projector window. A top bar button turns the mode on and off and shows its
state.

GNOME **50** (NixOS stable), pure GJS/ESM, **no build step**. Shipped code lives in
`src/`, dev helpers in `tests/`.

**`docs/specs/features.md` is the source of truth.** Any behavior change must be
reflected there first.

**Languages.** Repo content is **English** — code, comments, commit messages, README,
this file, and the UI source strings passed to `gettext`. **The specs under
`docs/specs/` are the exception: they are written and iterated in French**. Do not
translate them, and keep writing them in French when they change. Conversation with
Seb is in French too.

## Relation to Minibar and Daily time tracker

This project follows the standards and philosophy of
[minibar](https://github.com/essembeh/minibar) and
[daily-time-tracker](https://github.com/essembeh/daily-time-tracker) — same author,
same principles: strong opinions, few settings, small code. **Read them before
inventing anything here**: repo layout, tooling, CI, markdown conventions, dev
workflow and the GNOME 49/50 API gotchas listed in `daily-time-tracker/CLAUDE.md`
all apply here.

## Project invariants

- **The mirror is a `Clutter.Clone` of `global.window_group`**, never a screen
  capture (no PipeWire, no screencast, no encoding).
- **The mirror lives in `uiGroup` above `window_group`, never on `global.stage`**:
  the panel, menus and OSD must stay above it.
- **Never assume laptop = private and external = public.** The private screen is
  GNOME's **primary** monitor, the public one the **first non-primary** monitor.
  Code, UI strings and docs say primary/secondary, never laptop/external/projector.
- **Every side behavior of the mode has its own on/off setting** (pointer warp,
  auto-share, shortcut, Do Not Disturb). The mirror and its cursor dot are not
  optional.
  Settings switch a behavior off; they do not tune it.
- **Whatever the mode changes is restored**: `show-banners` back to its original
  value, the workspace keep-alive removed — including after a shell crash
  (`banners-muted`).
- Read-only mirror: no input forwarding through it, ever.

## Markdown formatting

Same rules as daily-time-tracker: tables padded so the pipes line up (count
characters, not bytes — checked by `tests/check-markdown.mjs`), prose wrapped at ~88
columns, fenced code blocks always carry a language tag.

## Feature requests: be critical (KISS guard)

When Seb asks for a new feature, assess the risk first (LOC, private shell members,
churn-prone APIs such as `Mutter.DisplayConfig` — already tried for the resolution
switch and removed), say so **before** implementing and
propose a compromise. Seb explicitly wants push-back, not compliance.

## Environment (NixOS)

- Dev tools come from `shell.nix` (`node`, `glib-compile-schemas`, `zip`, `just`),
  loaded by direnv (`.envrc`: `use nix`). Outside direnv:
  `nix-shell --run 'just <recipe>'`. Never hardcode `/nix/store/...` paths.
- Run the `Justfile` recipes, not ad-hoc commands: `just check` is what the CI runs
  and must pass before saying a change is ready.
- **No nested shell**: tried and removed, the devkit cannot show two monitors. Testing
  happens in Seb's real session with a real second screen (`just install`, then a
  session restart). Never ask him to restart his session without a reason.

## Git

Seb handles his own commits: Claude **never** runs `git commit` or `git push`. When a
change is ready, say so and suggest a commit message — gitmoji + English.
