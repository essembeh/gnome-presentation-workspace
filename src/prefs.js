import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences}
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Spec §6: a switch exists only if turning it off has a real use.
const SWITCHES = [
    ['smart-pointer', 'Smart pointer',
        'The pointer follows workspace 1 and keeps its place, the trackpad swipe works ' +
        'from the secondary screen, the overview keeps the pointer visible, and pushing ' +
        'the top edge reaches the top bar. Off: GNOME\'s own pointer behavior.'],
    ['smart-windows', 'Smart windows',
        'Windows opened on workspace 1 go to the secondary screen, Alt+Tab follows ' +
        'workspace 1, and leaving it takes the keyboard off projected windows. Off: ' +
        'GNOME\'s own behavior.'],
    ['mute-notifications', 'Do Not Disturb while presenting',
        'Notification banners stay off while the mode is on, and your previous ' +
        'setting comes back afterwards, even after a crash of GNOME Shell.'],
];

const POSITIONS = [
    ['center', 'Center'],
    ['right', 'Right'],
];

export default class PresentationWorkspacePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Bindings live as long as the settings object: keep it with the window.
        window._settings = settings;

        const page = new Adw.PreferencesPage({
            description: 'The mirror on workspace 1 is always on. These options apply ' +
                'right away, even with the mode on.',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup();
        page.add(group);
        for (const [key, title, subtitle] of SWITCHES) {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        }
        group.add(this._positionRow(settings));
        group.add(this._shortcutRow(window, settings));
    }

    _positionRow(settings) {
        const row = new Adw.ActionRow({
            title: 'Indicator position',
            subtitle: 'Where the top bar shows Mirror or Private while the mode is on. ' +
                'Center is just left of the clock.',
        });
        const toggles = new Adw.ToggleGroup({valign: Gtk.Align.CENTER});
        for (const [name, label] of POSITIONS)
            toggles.add(new Adw.Toggle({name, label}));
        settings.bind('indicator-position', toggles, 'active-name',
            Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(toggles);
        return row;
    }

    /** The share-window key: click, then press the new combination. */
    _shortcutRow(window, settings) {
        const row = new Adw.ActionRow({
            title: 'Share window shortcut',
            subtitle: 'Sends the focused window to the secondary screen, or brings it ' +
                'back. Works with the mode off too. Click to change it.',
            activatable: true,
        });
        const label = new Gtk.ShortcutLabel({
            disabled_text: 'None',
            valign: Gtk.Align.CENTER,
        });
        const sync = () => {
            label.accelerator = settings.get_strv('share-window')[0] ?? '';
        };
        settings.connect('changed::share-window', sync);
        sync();
        row.add_suffix(label);
        row.connect('activated', () => this._captureShortcut(window, settings));
        return row;
    }

    _captureShortcut(window, settings) {
        const dialog = new Adw.AlertDialog({
            heading: 'Share window shortcut',
            body: 'Press the new key combination, with at least one modifier ' +
                '(Super, Ctrl, Alt).\nBackspace restores Super+E, Escape cancels.',
        });
        dialog.add_response('cancel', 'Cancel');

        const keys = new Gtk.EventControllerKey({
            propagation_phase: Gtk.PropagationPhase.CAPTURE,
        });
        keys.connect('key-pressed', (_keys, keyval, _keycode, state) => {
            const mods = state & Gtk.accelerator_get_default_mod_mask();
            if (!mods && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (!mods && keyval === Gdk.KEY_BackSpace) {
                settings.reset('share-window');
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            // A bare letter would be stolen from every application.
            const key = Gdk.keyval_to_lower(keyval);
            if (!mods || !Gtk.accelerator_valid(key, mods))
                return Gdk.EVENT_STOP;
            settings.set_strv('share-window', [Gtk.accelerator_name(key, mods)]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(keys);
        dialog.present(window);
    }
}
