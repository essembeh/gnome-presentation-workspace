import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const ICON = 'video-display-symbolic';
const PRIVATE_ICON = 'changes-prevent-symbolic';
const CENTER_ROLE = 'presentation-workspace-state';

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

/**
 * Spec §4.1: a Quick Settings button and, only while the mode is on, a top bar state:
 * red "Mirror" on workspace 1, green "Private" elsewhere, left of the clock or at the
 * right of the bar.
 */
export const PresentationIndicator = GObject.registerClass(
class PresentationIndicator extends QuickSettings.SystemIndicator {
    _init(mode, extension) {
        super._init();
        this._mode = mode;
        this._settings = extension.getSettings();
        this._center = null;

        this._icon = this._addIndicator();
        this._icon.add_style_class_name('presentation-indicator');
        this._label = new St.Label({
            style_class: 'presentation-indicator presentation-indicator-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this._toggle = new PresentationToggle(mode, extension);
        this.quickSettingsItems.push(this._toggle);

        this._mode.connectObject('changed', () => this._sync(), this);
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._sync(), this);
        this._settings.connectObject('changed::indicator-position', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        const active = this._mode.active;
        const centered = this._settings.get_string('indicator-position') === 'center';
        this._syncCenter(active && centered);

        const mirrored = global.workspace_manager.get_active_workspace_index() === 0;
        const states = [[this._icon, this._label]];
        if (this._center)
            states.push([this._centerIcon, this._centerLabel]);
        for (const [icon, label] of states) {
            icon.icon_name = mirrored ? ICON : PRIVATE_ICON;
            label.text = mirrored ? 'Mirror' : 'Private';
            for (const actor of [icon, label]) {
                if (mirrored)
                    actor.add_style_class_name('presentation-mirrored');
                else
                    actor.remove_style_class_name('presentation-mirrored');
            }
        }
        // The label first: the indicator hides once the icon's change finds nothing visible.
        this._label.visible = active && !centered;
        this._icon.visible = active && !centered;
        this._toggle.sync();
    }

    /** The state left of the clock: a menuless panel button, position 0 of the center box. */
    _syncCenter(wanted) {
        if (wanted && !this._center) {
            this._center = new PanelMenu.Button(0.0, 'Presentation state', true);
            this._center.setSensitive(false);
            const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
            this._centerIcon = new St.Icon({
                style_class: 'system-status-icon presentation-indicator',
            });
            this._centerLabel = new St.Label({
                style_class: 'presentation-indicator presentation-indicator-label',
                y_align: Clutter.ActorAlign.CENTER,
            });
            box.add_child(this._centerIcon);
            box.add_child(this._centerLabel);
            this._center.add_child(box);
            Main.panel.addToStatusArea(CENTER_ROLE, this._center, 0, 'center');
        } else if (!wanted && this._center) {
            this._center.destroy();
            this._center = null;
            this._centerIcon = null;
            this._centerLabel = null;
        }
    }

    destroy() {
        this._mode.disconnectObject(this);
        global.workspace_manager.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._syncCenter(false);
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});
