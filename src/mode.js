import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

import {center, contains, pointerTarget} from './geometry.js';
import {Mirror} from './mirror.js';

// The shell's keep-alive is a one-shot timer: re-arm it well before it expires.
const KEEP_ALIVE_MS = 60 * 60 * 1000;
const KEEP_ALIVE_REFRESH_S = 10 * 60;

/** First non-primary monitor: the public screen. The primary one is the private screen. */
export function secondaryMonitor() {
    const {monitors, primaryIndex} = Main.layoutManager;
    return monitors.find(m => m.index !== primaryIndex) ?? null;
}

/** Puts `show-banners` back if this extension muted it and nobody touched it since. */
export function restoreBanners(settings) {
    if (!settings.get_boolean('banners-muted'))
        return;
    const notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
    if (!notifications.get_boolean('show-banners'))
        notifications.set_boolean('show-banners', true);
    settings.set_boolean('banners-muted', false);
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
            'showing', () => this._updateVisibility(),
            'hidden', () => this._updateVisibility(), this);

        this._keepWorkspaceAlive();
        this._keepAliveSourceId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, KEEP_ALIVE_REFRESH_S, () => {
                this._keepWorkspaceAlive();
                return GLib.SOURCE_CONTINUE;
            });

        this._trackCursor();
        this._updateVisibility();
        // Turning the mode on while on workspace 1 counts as arriving on it.
        this._workspaceIndex = -1;
        this._warpPointer();
        this._muteBanners();
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

        this._cursorTracker.disconnectObject(this);
        this._settings.disconnectObject(this);
        Main.overview.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);

        global.compositor.enable_unredirect();

        this._mirror.destroy();
        this._mirror = null;

        restoreBanners(this._settings);
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
    }

    _onWorkspaceChanged() {
        this._keepWorkspaceAlive();
        this._updateVisibility();
        this._warpPointer();
    }

    /** Workspace 1 is the secondary screen: the pointer follows workspace switches in and out of it. */
    _warpPointer() {
        const previous = this._workspaceIndex;
        this._workspaceIndex = global.workspace_manager.get_active_workspace_index();
        if (!this._settings.get_boolean('warp-pointer'))
            return;

        const secondary = secondaryMonitor();
        const [x, y] = global.get_pointer();
        const target = pointerTarget(previous, this._workspaceIndex, contains(secondary, x, y));
        if (target === null)
            return;
        const {monitors, primaryIndex} = Main.layoutManager;
        const point = center(target === 'secondary' ? secondary : monitors[primaryIndex]);
        this._seat.warp_pointer(point.x, point.y);
    }

    _updateGeometry() {
        const workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        this._mirror.setGeometry(workArea, secondaryMonitor());
    }

    _updateVisibility() {
        this._mirror.visible = global.workspace_manager.get_active_workspace_index() === 0 &&
            !Main.overview.visible;
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
        if (!this._settings.get_boolean('auto-share') ||
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

    _muteBanners() {
        if (!this._settings.get_boolean('mute-notifications'))
            return;
        const notifications = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        if (!notifications.get_boolean('show-banners'))
            return;
        // Recorded first: if the shell dies now, the next enable() restores them.
        this._settings.set_boolean('banners-muted', true);
        notifications.set_boolean('show-banners', false);
    }
}
