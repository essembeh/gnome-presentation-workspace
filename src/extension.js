import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {returnWorkspace} from './geometry.js';
import {PresentationMode, restoreBanners, secondaryMonitor} from './mode.js';
import {PresentationIndicator} from './indicator.js';

const SHAREABLE = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];

export default class PresentationWorkspaceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        // The shell may have died with the mode on and the banners muted.
        restoreBanners(this._settings);

        this._mode = new PresentationMode(this._settings);
        this._indicator = new PresentationIndicator(this._mode, this._settings);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Workspace each shared window came from, to bring it back there. The workspace
        // itself, not its index: inserting the mirror workspace shifts every index.
        this._origins = new WeakMap();
        this._shortcutBound = false;
        this._settings.connectObject('changed::share-shortcut', () => this._syncShortcut(), this);
        this._syncShortcut();
    }

    disable() {
        this._settings.disconnectObject(this);
        if (this._shortcutBound)
            Main.wm.removeKeybinding('share-window');
        this._shortcutBound = false;
        this._origins = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._mode?.destroy();
        this._mode = null;
        this._settings = null;
    }

    _syncShortcut() {
        const wanted = this._settings.get_boolean('share-shortcut');
        if (wanted === this._shortcutBound)
            return;
        if (wanted) {
            Main.wm.addKeybinding('share-window', this._settings, Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL, () => this._shareWindow());
        } else {
            Main.wm.removeKeybinding('share-window');
        }
        this._shortcutBound = wanted;
    }

    /** Sends the focused window to the secondary screen, or brings it back to the primary one. */
    _shareWindow() {
        const secondary = secondaryMonitor();
        const window = global.display.focus_window;
        if (!secondary || !window || !SHAREABLE.includes(window.get_window_type()))
            return;

        const manager = global.workspace_manager;
        if (window.get_monitor() !== secondary.index) {
            this._origins.set(window, window.get_workspace());
            window.move_to_monitor(secondary.index);
            return;
        }

        window.move_to_monitor(Main.layoutManager.primaryIndex);
        const origin = this._origins.get(window);
        // -1 when that workspace is gone (dynamic workspaces remove empty ones).
        const originIndex = Array.from({length: manager.n_workspaces}, (_, i) => i)
            .find(i => manager.get_workspace_by_index(i) === origin) ?? -1;
        const index = returnWorkspace(originIndex,
            manager.get_active_workspace_index(), manager.n_workspaces, this._mode.active);
        this._origins.delete(window);
        window.change_workspace_by_index(index, false);
        window.activate(global.get_current_time());
    }
}
