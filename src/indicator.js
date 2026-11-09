import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// One switch per side behavior of the mode (spec §6).
const OPTIONS = [
    ['warp-pointer', 'Pointer follows workspace 1'],
    ['auto-share', 'Workspace 1 opens on the secondary screen'],
    ['share-shortcut', 'Share window shortcut'],
    ['mute-notifications', 'Do Not Disturb'],
];

/**
 * Top bar button: red while the presentation mode is on. Its menu holds the mode
 * switch (insensitive without a secondary screen) and the option switches.
 */
export const PresentationIndicator = GObject.registerClass(
class PresentationIndicator extends PanelMenu.Button {
    _init(mode, settings) {
        super._init(0.0, 'Presentation');
        this._mode = mode;
        this._settings = settings;
        this.add_child(new St.Icon({
            icon_name: 'video-display-symbolic',
            style_class: 'system-status-icon',
        }));

        this._switch = new PopupMenu.PopupSwitchMenuItem('Presentation mode', false);
        this._switch.connect('toggled', (_item, state) => {
            if (state)
                this._mode.activate();
            else
                this._mode.deactivate();
            // activate() is a no-op without a secondary screen: show the real state.
            this._sync();
        });
        this.menu.addMenuItem(this._switch);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Options'));
        OPTIONS.forEach(([key, label]) => this.menu.addMenuItem(this._optionItem(key, label)));

        this._mode.connectObject('changed', () => this._sync(), this);
        this._sync();
    }

    _optionItem(key, label) {
        const item = new PopupMenu.PopupSwitchMenuItem(label, this._settings.get_boolean(key));
        // Toggle without the 'activate' emission, so the menu stays open.
        item.activate = () => item.toggle();
        item.connect('toggled', (_item, state) => this._settings.set_boolean(key, state));
        this._settings.connectObject(`changed::${key}`,
            () => item.setToggleState(this._settings.get_boolean(key)), this);
        return item;
    }

    _sync() {
        const active = this._mode.active;
        this._switch.setToggleState(active);
        this._switch.setSensitive(this._mode.available);
        if (active)
            this.add_style_class_name('presentation-active');
        else
            this.remove_style_class_name('presentation-active');
    }

    destroy() {
        this._mode.disconnectObject(this);
        this._settings.disconnectObject(this);
        super.destroy();
    }
});
