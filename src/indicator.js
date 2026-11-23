import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const ICON = 'video-display-symbolic';
const PRIVATE_ICON = 'changes-prevent-symbolic';
const BUTTON_ROLE = 'presentation-workspace-state';

/** The Quick Settings button: turns the mode on and off, its menu opens the preferences. */
const PresentationToggle = GObject.registerClass(
class PresentationToggle extends QuickSettings.QuickMenuToggle {
    _init(mode, extension) {
        super._init({title: 'Presentation', iconName: ICON});
        this._mode = mode;

        this.menu.setHeader(ICON, 'Presentation mode',
            'Workspace 1 mirrors the secondary screen');
        this.menu.addAction('Preferences', () => extension.openPreferences());

        this.connect('clicked', () => {
            if (this._mode.active)
                this._mode.deactivate();
            else
                this._mode.activate();
        });
    }

    sync() {
        const available = this._mode.available;
        this.checked = this._mode.active;
        // Greyed out and not clickable without a secondary screen; the arrow and its
        // Preferences entry stay usable.
        this.reactive = available;
        if (available)
            this.remove_style_pseudo_class('insensitive');
        else
            this.add_style_pseudo_class('insensitive');
        this.subtitle = available ? null : 'No secondary screen';
    }
});

/** The top bar button while the mode is on: the state, picture-in-picture, preferences. */
const StateButton = GObject.registerClass(
class StateButton extends PanelMenu.Button {
    _init(mode, extension) {
        super._init(0.0, 'Presentation state');
        this._mode = mode;

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({style_class: 'system-status-icon presentation-indicator'});
        this._label = new St.Label({
            style_class: 'presentation-indicator presentation-indicator-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this._pip = new PopupMenu.PopupSwitchMenuItem('Picture-in-picture', false);
        this._pip.connect('toggled', (_item, state) => this._mode.setPip(state));
        this.menu.addMenuItem(this._pip);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Preferences', () => extension.openPreferences());
    }

    sync() {
        const mirrored = global.workspace_manager.get_active_workspace_index() === 0;
        this._icon.icon_name = mirrored ? ICON : PRIVATE_ICON;
        this._label.text = mirrored ? 'Mirror' : 'Private';
        for (const actor of [this._icon, this._label]) {
            if (mirrored)
                actor.add_style_class_name('presentation-mirrored');
            else
                actor.remove_style_class_name('presentation-mirrored');
        }
        this._pip.setToggleState(this._mode.pip);
    }
});

/**
 * Spec §4.1: a Quick Settings button and, only while the mode is on, a top bar button
 * showing a red "Mirror" on workspace 1 and a green "Private" elsewhere.
 */
export const PresentationIndicator = GObject.registerClass(
class PresentationIndicator extends QuickSettings.SystemIndicator {
    _init(mode, extension) {
        super._init();
        this._mode = mode;
        this._extension = extension;
        this._button = null;

        this._toggle = new PresentationToggle(mode, extension);
        this.quickSettingsItems.push(this._toggle);

        this._mode.connectObject('changed', () => this._sync(), this);
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        this._syncButton(this._mode.active);
        this._button?.sync();
        this._toggle.sync();
    }

    _syncButton(wanted) {
        if (wanted && !this._button) {
            this._button = new StateButton(this._mode, this._extension);
            Main.panel.addToStatusArea(BUTTON_ROLE, this._button, 0, 'right');
        } else if (!wanted && this._button) {
            this._button.destroy();
            this._button = null;
        }
    }

    destroy() {
        this._mode.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        this._syncButton(false);
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});
