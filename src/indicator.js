import GObject from 'gi://GObject';

import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const ICON = 'video-display-symbolic';

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
 * Spec §4.1: a Quick Settings button, and a red top bar icon only while the mode is
 * on — nothing in the top bar otherwise.
 */
export const PresentationIndicator = GObject.registerClass(
class PresentationIndicator extends QuickSettings.SystemIndicator {
    _init(mode, extension) {
        super._init();
        this._mode = mode;

        this._icon = this._addIndicator();
        this._icon.icon_name = ICON;
        this._icon.add_style_class_name('presentation-indicator');

        this._toggle = new PresentationToggle(mode, extension);
        this.quickSettingsItems.push(this._toggle);

        this._mode.connectObject('changed', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        this._icon.visible = this._mode.active;
        this._toggle.sync();
    }

    destroy() {
        this._mode.disconnectObject(this);
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});
