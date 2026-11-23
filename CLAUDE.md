# CLAUDE.md — Presentation workspace

`presentation-workspace@essembeh.org` is a GNOME Shell extension for **presenting on a
secondary screen in extended (joined) mode**: workspace 1 of the primary screen shows
a live mirror of the secondary screen, the other workspaces stay private. It replaces
an OBS projector window. A Quick Settings button turns the mode on and off and
opens the preferences; while the mode is on, the top bar shows a red "Mirror" on
workspace 1 and a green "Private" on the others.

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
- **A setting exists only if turning it off has a real use.** Side behaviors are
  grouped by intent, on by default: `smart-pointer` (pointer follows, swipe from the
  secondary screen, overview, top edge) and `smart-windows` (auto-share, Alt+Tab,
  keyboard leaving projected windows). Do Not Disturb has its own switch. The mirror,
  its dot, its slide and overview preview, and the top bar state are not optional.
  Settings switch a behavior off; they do not tune it — the share-window key
  combination and the top bar state's position are the only exceptions.
- **Quick Settings holds the mode switch and "Preferences" only**; the extension adds
  nothing to the top bar while the mode is off. The options live in `prefs.js`, with
  one explanatory line each.
- **Whatever the mode changes is restored**: `show-banners` back to its original
  value, the app switcher's `current-workspace-only` too, the workspace keep-alive
  removed — including after a shell crash (`banners-muted`, `switcher-forced`).
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

## New GNOME version: revalidation

Run this whole process **each time NixOS offers a new GNOME version**, before declaring
it in `shell-version`. GNOME refuses to load the extension on an undeclared version, so
add it on a branch to test, and release only once every point below passes.

**1. Diff the private members.** Extract the new sources and check that each one below
still exists and still works the same way; the old version's sources give the diff.

```bash
d=$(nix-store -qR "$(readlink -f "$(command -v gnome-shell)")" |
    grep -E -- '-gnome-shell-[0-9.]+$' | head -1)
gresource extract "$(ls "$d"/lib/gnome-shell/libshell-*.so | head -1)" \
    /org/gnome/shell/ui/workspaceAnimation.js
```

- `workspaceAnimation.js`: `_prepareWorkspaceSwitch`, `_finishWorkspaceSwitch`,
  `_switchData`, `MonitorGroup._workspaceGroups`, `_swipeTracker`, and the animation
  still inserted right above `global.window_group`.
- `windowManager.js`: `Main.wm._workspaceAnimation`, `keepWorkspaceAlive`,
  `insertWorkspace`.
- `swipeTracker.js`: `_beginGesture`, still called through `this`.
- `altTab.js`: `AppSwitcherPopup._finish`, `_items`, `_selectedIndex`, `_currentWindow`,
  `cachedWindows`.
- `workspace.js`: `Workspace._isMyWindow`, `metaWorkspace`, `monitorIndex`.
- `layout.js`: `PressureBarrier`, `hotCorners`, `setBarrierSize`, `panelBox`.
- `quickSettings.js`: `SystemIndicator`, `QuickMenuToggle`, `_addIndicator`,
  `addExternalIndicator`.
- `panel.js`, `panelMenu.js`: `addToStatusArea` with the center box, the clock still
  in it, `PanelMenu.Button` without a menu, `setSensitive`.

**2. Run `just check`, then `just install`**, and ask Seb to log out and back in.

**3. Seb tests in his real session, with a real second screen:**

- **Mode:** the Quick Settings button is greyed out without a second screen. The top
  bar shows a red "Mirror" on workspace 1, a green "Private" elsewhere, nothing with the
  mode off, left of the clock or at the right depending on the preference, which applies
  right away. Unplugging the screen turns the mode off.
- **Mirror:** live, ratio kept with black bands, blue dot on the pointer, top bar and
  menus above it, clicks ignored. Workspace 1 survives while empty. Windows already on
  it move to workspace 2 when the mode turns on.
- **Windows:** the share shortcut sends a window and follows it to workspace 1 (mode on
  with Smart windows, also fullscreen), then brings it back to its workspace.
  A window opened on workspace 1 goes to the secondary screen.
- **Top edge:** a push along the whole width reaches the top bar at the matching spot,
  without opening the overview. Going down returns to the secondary screen, also after
  closing a top bar menu.
- **Alt+Tab:** workspace 1 lists only projected windows. Picking one from a private
  workspace goes back to workspace 1.
- **Overview:** workspace 1's preview shows the projected windows. Opened from the
  secondary screen, it brings the pointer to the primary one. The pointer stays there
  until the overview closes, then shows as the dot on workspace 1.
- **Gesture:** it works with the pointer on the secondary screen, and the mirror slides
  both ways. A cancelled swipe restores the mirror. **Nothing freezes: input always
  comes back.**
- **Pointer and keyboard:** after a swipe the pointer keeps its place, also near each
  corner, without opening the overview. Typing lands in the new workspace's window, and
  never in a projected window when that workspace is empty.
- **Restoration:** turning the mode off restores Do Not Disturb and Alt+Tab settings.
  With Smart pointer and Smart windows off, right away, the pointer, Alt+Tab and new
  windows behave like plain GNOME.

**4. Read the log** after these tests. Any line here is a regression to fix, including
the "mirror slide" ones: the fallback keeps the session usable but hides a broken hook.
The filter drops the harmless notice that the dev copy shadows the NixOS one.

```bash
journalctl --user -b | grep -i presentation-workspace | grep -v 'already installed'
```

## Git

Seb handles his own commits: Claude **never** runs `git commit` or `git push`. When a
change is ready, say so and suggest a commit message — gitmoji + English.
