import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/**
 * Top bar button: red while the presentation mode is on. Its menu holds the mode
 * switch (insensitive without a secondary screen) and opens the preferences.
 */
export const PresentationIndicator = GObject.registerClass(
class PresentationIndicator extends PanelMenu.Button {
    _init(mode, extension) {
        super._init(0.0, 'Presentation');
        this._mode = mode;
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
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Preferences', () => extension.openPreferences());

        this._mode.connectObject('changed', () => this._sync(), this);
        this._sync();
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
        super.destroy();
    }
});
