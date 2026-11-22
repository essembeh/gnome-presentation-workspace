import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SwipeTracker from 'resource:///org/gnome/shell/ui/swipeTracker.js';
import * as WorkspaceAnimation from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import * as WorkspaceUI from 'resource:///org/gnome/shell/ui/workspace.js';
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

import {
    center, contains, mirrorView, pointerTarget, toMirrorPoint, toSecondaryPoint,
} from './geometry.js';
import {Mirror} from './mirror.js';
import {TopEdge} from './topedge.js';

// The shell's keep-alive is a one-shot timer: re-arm it well before it expires.
const KEEP_ALIVE_MS = 60 * 60 * 1000;
const KEEP_ALIVE_REFRESH_S = 10 * 60;

/** First non-primary monitor: the public screen. The primary one is the private screen. */
export function secondaryMonitor() {
    const {monitors, primaryIndex} = Main.layoutManager;
    return monitors.find(m => m.index !== primaryIndex) ?? null;
}

// Desktop settings the mode overrides: [crash flag, schema, key, value while forced].
const OVERRIDES = {
    banners: ['banners-muted', 'org.gnome.desktop.notifications', 'show-banners', false],
    switcher: ['switcher-forced', 'org.gnome.shell.app-switcher', 'current-workspace-only', true],
};

function force(settings, name) {
    const [flag, schema, key, value] = OVERRIDES[name];
    if (settings.get_boolean(flag))
        return;
    const desktop = new Gio.Settings({schema_id: schema});
    if (desktop.get_boolean(key) === value)
        return;
    // Recorded first: if the shell dies now, the next enable() restores it.
    settings.set_boolean(flag, true);
    desktop.set_boolean(key, value);
}

/** Puts an overridden setting back, unless the user changed it since. */
function release(settings, name) {
    const [flag, schema, key, value] = OVERRIDES[name];
    if (!settings.get_boolean(flag))
        return;
    const desktop = new Gio.Settings({schema_id: schema});
    if (desktop.get_boolean(key) === value)
        desktop.set_boolean(key, !value);
    settings.set_boolean(flag, false);
}

/** Restores every desktop setting the mode overrode, including after a shell crash. */
export function restoreOverrides(settings) {
    Object.keys(OVERRIDES).forEach(name => release(settings, name));
}

/**
 * The presentation mode: the mirror on workspace 1 plus the side behaviors, each
 * behind its own setting. Emits 'changed' when it turns on or off.
 */
export class PresentationMode extends Signals.EventEmitter {
    constructor(settings) {
        super();
        this._settings = settings;
        this._active = false;
        this._mirror = null;
        this._keptWorkspace = null;
        this._keepAliveSourceId = 0;
        // New windows on workspace 1, waiting to be shown (i.e. placed) before moving.
        this._pending = new Set();
        this._laterIds = new Set();
        this._workspaceIndex = -1;
        this._topEdge = null;
        this._injections = new InjectionManager();
        this._switcherPatched = false;
        this._overviewInjections = new InjectionManager();
        this._gestureInjections = new InjectionManager();
        this._sliding = false;
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._seat = global.stage.get_context().get_backend().get_default_seat();

        Main.layoutManager.connectObject('monitors-changed', () => this._onMonitorsChanged(), this);
    }

    get active() {
        return this._active;
    }

    get available() {
        return secondaryMonitor() !== null;
    }

    toggle() {
        if (this._active)
            this.deactivate();
        else
            this.activate();
    }

    activate() {
        if (this._active || !this.available)
            return;
        this._active = true;
        this._freeMirrorWorkspace();

        this._mirror = new Mirror();
        Main.layoutManager.uiGroup.insert_child_above(this._mirror, global.window_group);
        this._updateGeometry();

        // A fullscreen window on the secondary screen would bypass the compositor and
        // freeze the clone.
        global.compositor.disable_unredirect();

        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._onWorkspaceChanged(), this);
        Main.overview.connectObject(
            'showing', () => {
                this._updateVisibility();
                this._topEdge?.reset();
                this._pullPointerToOverview();
            },
            'hidden', () => this._onOverviewHidden(), this);

        this._keepWorkspaceAlive();
        this._keepAliveSourceId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, KEEP_ALIVE_REFRESH_S, () => {
                this._keepWorkspaceAlive();
                return GLib.SOURCE_CONTINUE;
            });

        this._trackCursor();
        this._patchOverview();
        this._patchGesture();
        this._updateVisibility();
        // Turning the mode on while on workspace 1 counts as arriving on it.
        this._workspaceIndex = -1;
        this._warpPointer();
        if (this._settings.get_boolean('mute-notifications'))
            force(this._settings, 'banners');
        this._settings.connectObject(
            'changed::smart-windows', () => this._syncSwitcher(),
            'changed::smart-pointer', () => this._syncTopEdge(), this);
        this._syncSwitcher();
        this._syncTopEdge();
        this.emit('changed');
    }

    deactivate() {
        if (!this._active)
            return;
        this._active = false;

        if (this._keepAliveSourceId) {
            GLib.source_remove(this._keepAliveSourceId);
            this._keepAliveSourceId = 0;
        }
        // A zero duration lets the shell's own timer clear the flag right away.
        if (this._keptWorkspace) {
            Main.wm.keepWorkspaceAlive(this._keptWorkspace, 0);
            this._keptWorkspace.disconnectObject(this);
        }
        this._keptWorkspace = null;
        [...this._pending].forEach(window => this._forget(window));
        const laters = global.compositor.get_laters();
        this._laterIds.forEach(id => laters.remove(id));
        this._laterIds.clear();

        this._topEdge?.destroy();
        this._topEdge = null;
        this._cursorTracker.disconnectObject(this);
        this._settings.disconnectObject(this);
        Main.overview.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);

        global.compositor.enable_unredirect();

        this._mirror.destroy();
        this._mirror = null;

        this._unpatchSwitcher();
        this._overviewInjections.clear();
        this._gestureInjections.clear();
        this._sliding = false;
        restoreOverrides(this._settings);
        this.emit('changed');
    }

    destroy() {
        this.deactivate();
        Main.layoutManager.disconnectObject(this);
        this._settings = null;
    }

    /**
     * Workspace 1 must hold nothing but the mirror: if it has windows, insert an empty
     * workspace in front (the shell's own drop-between-workspaces method), and stay on
     * it when the mode was turned on from workspace 1.
     */
    _freeMirrorWorkspace() {
        const manager = global.workspace_manager;
        const occupied = manager.get_workspace_by_index(0).list_windows()
            .some(window => !window.is_on_all_workspaces() && !window.is_override_redirect());
        if (!occupied || !Meta.prefs_get_dynamic_workspaces())
            return;
        const fromFirst = manager.get_active_workspace_index() === 0;
        Main.wm.insertWorkspace(0);
        if (fromFirst)
            manager.get_workspace_by_index(0).activate(global.get_current_time());
    }

    _onMonitorsChanged() {
        if (!this._active) {
            this.emit('changed');
            return;
        }
        if (!this.available) {
            this.deactivate();
            return;
        }
        this._updateGeometry();
        this._topEdge?.update();
    }

    _onWorkspaceChanged() {
        this._topEdge?.reset();
        this._keepWorkspaceAlive();
        this._updateVisibility();
        this._warpPointer();
        this._syncSwitcher();
    }

    /** The overview only shows on the primary screen: a pointer left on the other is lost. */
    _pullPointerToOverview() {
        const [x, y] = global.get_pointer();
        if (this._settings.get_boolean('smart-pointer') &&
            global.workspace_manager.get_active_workspace_index() === 0 &&
            contains(secondaryMonitor(), x, y))
            this._jumpPointer(false, x, y);
    }

    /** The pointer jump held back during the overview; closing it on workspace 1 is an arrival. */
    _onOverviewHidden() {
        this._updateVisibility();
        if (global.workspace_manager.get_active_workspace_index() === 0)
            this._workspaceIndex = -1;
        // The click that closed the overview already chose the focused window.
        this._warpPointer(false);
    }

    /**
     * Alt+Tab follows workspace 1. On it, Alt+Tab lists the current workspace only: the
     * secondary screen's windows, which are on every workspace, since workspace 1 holds
     * nothing else. Elsewhere, picking a window of the secondary screen goes to it.
     */
    _syncSwitcher() {
        const enabled = this._active && this._settings.get_boolean('smart-windows');
        if (enabled && global.workspace_manager.get_active_workspace_index() === 0)
            force(this._settings, 'switcher');
        else
            release(this._settings, 'switcher');

        if (!enabled)
            this._unpatchSwitcher();
        else if (!this._switcherPatched)
            this._patchSwitcher();
    }

    _patchSwitcher() {
        const mode = this;
        this._injections.overrideMethod(AltTab.AppSwitcherPopup.prototype, '_finish',
            original => function (timestamp) {
                // The window the switcher is about to activate, picked as its _finish does.
                const icon = this._items[this._selectedIndex];
                const window = icon?.cachedWindows[Math.max(this._currentWindow, 0)];
                original.call(this, timestamp);
                mode._followToMirror(window, timestamp);
            });
        this._switcherPatched = true;
    }

    _unpatchSwitcher() {
        this._injections.clear();
        this._switcherPatched = false;
    }

    /**
     * In the overview the mirror is hidden, and workspace 1 of the primary screen would
     * look empty: its preview takes the secondary screen's windows too (spec §4.10).
     */
    _patchOverview() {
        const mode = this;
        this._overviewInjections.overrideMethod(WorkspaceUI.Workspace.prototype, '_isMyWindow',
            original => function (window) {
                return original.call(this, window) ||
                    mode._isMirrored(this.metaWorkspace, this.monitorIndex, window);
            });
    }

    _isMirrored(workspace, monitorIndex, window) {
        return this._active && workspace?.index() === 0 &&
            monitorIndex === Main.layoutManager.primaryIndex &&
            window.get_monitor() === secondaryMonitor()?.index;
    }

    /**
     * GNOME drops a workspace swipe started off the primary screen when workspaces only
     * exist there: it counts as started on the primary screen (spec §4.6).
     */
    _patchGesture() {
        const mode = this;
        this._gestureInjections.overrideMethod(SwipeTracker.SwipeTracker.prototype, '_beginGesture',
            original => function (x, y) {
                if (mode._settings.get_boolean('smart-pointer') &&
                    this === Main.wm._workspaceAnimation?._swipeTracker &&
                    contains(secondaryMonitor(), x, y)) {
                    const point = center(Main.layoutManager.primaryMonitor);
                    original.call(this, point.x, point.y);
                    return;
                }
                original.call(this, x, y);
            });

        const controller = WorkspaceAnimation.WorkspaceAnimationController.prototype;
        // Both or neither: without the end of the animation, the mirror would stay hidden.
        if (typeof controller._prepareWorkspaceSwitch !== 'function' ||
            typeof controller._finishWorkspaceSwitch !== 'function') {
            console.warn('presentation-workspace: workspace animation changed, mirror slide off');
            return;
        }
        this._gestureInjections.overrideMethod(controller, '_prepareWorkspaceSwitch',
            original => function (...args) {
                original.apply(this, args);
                mode._startSlide(this._switchData);
            });
        this._gestureInjections.overrideMethod(controller, '_finishWorkspaceSwitch',
            original => function (...args) {
                try {
                    original.apply(this, args);
                } finally {
                    mode._endSlide();
                }
            });
    }

    /** GNOME's animation runs under the mirror: a copy slides inside workspace 1's group. */
    _startSlide(switchData) {
        // GNOME holds the input grab here: an exception would leave the session stuck.
        let copy = null;
        try {
            const {primaryIndex, primaryMonitor} = Main.layoutManager;
            const group = switchData.monitors.find(monitor => monitor.index === primaryIndex)
                ?._workspaceGroups.find(candidate => candidate.workspace.index() === 0);
            if (!group)
                return;
            const {x, y, width, height} = Main.layoutManager.getWorkAreaForMonitor(primaryIndex);
            copy = new Mirror();
            copy.setGeometry({x: x - primaryMonitor.x, y: y - primaryMonitor.y, width, height},
                secondaryMonitor());
            const [pointerX, pointerY] = global.get_pointer();
            copy.setPointer(pointerX, pointerY);
            copy.visible = true;
            group.add_child(copy);
            this._sliding = true;
            this._updateVisibility();
        } catch (error) {
            console.error('presentation-workspace: mirror slide failed', error);
            copy?.destroy();
            this._sliding = false;
            this._updateVisibility();
        }
    }

    _endSlide() {
        this._sliding = false;
        if (this._active)
            this._updateVisibility();
    }

    /** A window of the secondary screen picked with Alt+Tab from a private workspace. */
    _followToMirror(window, timestamp) {
        const manager = global.workspace_manager;
        if (!this._active || !window || manager.get_active_workspace_index() === 0 ||
            window.get_monitor() !== secondaryMonitor()?.index)
            return;
        manager.get_workspace_by_index(0).activate_with_focus(window, timestamp);
    }

    _syncTopEdge() {
        const wanted = this._settings.get_boolean('smart-pointer');
        if (wanted && !this._topEdge) {
            this._topEdge = new TopEdge(() => secondaryMonitor(), () => this._mirror.visible);
        } else if (!wanted && this._topEdge) {
            this._topEdge.destroy();
            this._topEdge = null;
        }
    }

    /** Workspace 1 is the secondary screen: the pointer follows workspace switches in and out of it. */
    _warpPointer(moveFocus = true) {
        // No mirror in the overview to show the pointer: wait for it to close.
        if (Main.overview.visible)
            return;
        const previous = this._workspaceIndex;
        this._workspaceIndex = global.workspace_manager.get_active_workspace_index();
        if (moveFocus && previous === 0 && this._workspaceIndex !== 0 &&
            this._settings.get_boolean('smart-windows'))
            this._queueFocusPrimary();
        if (!this._settings.get_boolean('smart-pointer'))
            return;

        const secondary = secondaryMonitor();
        const [x, y] = global.get_pointer();
        const target = pointerTarget(previous, this._workspaceIndex, contains(secondary, x, y));
        if (target === null)
            return;
        this._jumpPointer(target === 'secondary', x, y);
    }

    /** Moves the pointer between a point of the secondary screen and its place in the mirror. */
    _jumpPointer(toSecondary, x, y) {
        const secondary = secondaryMonitor();
        const {primaryIndex, primaryMonitor} = Main.layoutManager;
        const view = mirrorView(Main.layoutManager.getWorkAreaForMonitor(primaryIndex), secondary);
        const point = (toSecondary ? toSecondaryPoint : toMirrorPoint)(view, secondary, x, y);
        // A warp is a motion: through mid-height, it stays clear of barriers and hot corners.
        const [from, to] = toSecondary ? [primaryMonitor, secondary] : [secondary, primaryMonitor];
        this._seat.warp_pointer(x, center(from).y);
        this._seat.warp_pointer(point.x, center(to).y);
        this._seat.warp_pointer(point.x, point.y);
    }

    /** Decided after the switch: a window activated along with it keeps the focus. */
    _queueFocusPrimary() {
        const id = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._laterIds.delete(id);
            this._focusPrimary();
            return GLib.SOURCE_REMOVE;
        });
        this._laterIds.add(id);
    }

    /** Takes the keyboard off a projected window: typing must not reach the room. */
    _focusPrimary() {
        const manager = global.workspace_manager;
        const focused = global.display.focus_window;
        if (!this._active || Main.overview.visible || manager.get_active_workspace_index() === 0 ||
            focused?.get_monitor() !== secondaryMonitor()?.index)
            return;
        const {primaryIndex} = Main.layoutManager;
        const window = global.display.get_tab_list(Meta.TabList.NORMAL, manager.get_active_workspace())
            .find(candidate => candidate.get_monitor() === primaryIndex && !candidate.minimized);
        const time = global.get_current_time();
        if (window)
            window.activate(time);
        else
            global.display.unset_input_focus(time);
    }

    _updateGeometry() {
        const workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        this._mirror.setGeometry(workArea, secondaryMonitor());
    }

    _updateVisibility() {
        this._mirror.visible = global.workspace_manager.get_active_workspace_index() === 0 &&
            !Main.overview.visible && !this._sliding;
        this._topEdge?.sync();
    }

    _keepWorkspaceAlive() {
        // Dynamic workspaces drop an empty workspace that is not the last one.
        const workspace = global.workspace_manager.get_workspace_by_index(0);
        if (this._keptWorkspace !== workspace) {
            if (this._keptWorkspace) {
                Main.wm.keepWorkspaceAlive(this._keptWorkspace, 0);
                this._keptWorkspace.disconnectObject(this);
            }
            this._keptWorkspace = workspace;
            workspace.connectObject(
                'window-added', (_workspace, window) => this._onMirrorWindowAdded(window), this);
        }
        Main.wm.keepWorkspaceAlive(workspace, KEEP_ALIVE_MS);
    }

    /** Workspace 1 shows the secondary screen: a window landing there belongs on it. */
    _onMirrorWindowAdded(window) {
        if (!this._settings.get_boolean('smart-windows') ||
            window.get_window_type() !== Meta.WindowType.NORMAL || this._pending.has(window))
            return;
        if (window.get_compositor_private()?.is_mapped()) {
            this._queueSendToSecondary(window);
            return;
        }
        // A new window is not placed yet: moving it now would be undone by placement.
        this._pending.add(window);
        window.connectObject(
            'shown', () => {
                this._forget(window);
                this._queueSendToSecondary(window);
            },
            'unmanaged', () => this._forget(window), this);
    }

    _forget(window) {
        window.disconnectObject(this);
        this._pending.delete(window);
    }

    /**
     * Decided at the end of the cycle, not in the signal: a window brought back by the
     * share shortcut crosses workspace 1 before reaching its own workspace.
     */
    _queueSendToSecondary(window) {
        const id = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._laterIds.delete(id);
            this._sendToSecondary(window);
            return GLib.SOURCE_REMOVE;
        });
        this._laterIds.add(id);
    }

    _sendToSecondary(window) {
        const secondary = secondaryMonitor();
        if (!this._active || !secondary || !window.get_compositor_private() ||
            window.is_on_all_workspaces() ||
            window.get_workspace()?.index() !== 0 ||
            window.get_monitor() !== Main.layoutManager.primaryIndex)
            return;
        window.move_to_monitor(secondary.index);
    }

    _trackCursor() {
        this._cursorTracker.connectObject('position-invalidated', () => {
            const [x, y] = global.get_pointer();
            this._mirror.setPointer(x, y);
        }, this);
        const [x, y] = global.get_pointer();
        this._mirror.setPointer(x, y);
    }
}
