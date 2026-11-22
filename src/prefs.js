import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences}
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Grouped by theme (spec §4.1). Every option switches one side behavior on or off;
// the share-window key is the one setting that is not a switch.
const GROUPS = [
    {
        title: 'Pointer',
        options: [
            ['warp-pointer', 'Pointer and keyboard follow workspace 1',
                'Arriving on workspace 1 puts the pointer on the secondary screen, at the ' +
                'spot it was over in the mirror. Leaving it brings the pointer back to ' +
                'that spot on the primary screen, and takes the keyboard off projected ' +
                'windows.'],
            ['top-edge', 'Push the top edge to reach the top bar',
                'On workspace 1, push the pointer against the top of the secondary screen: ' +
                'it lands on the top bar, right above its place in the mirror. Going back ' +
                'down from the top bar returns it to the secondary screen.'],
        ],
    },
    {
        title: 'Windows',
        options: [
            ['auto-share', 'Workspace 1 opens on the secondary screen',
                'A window opened or moved to workspace 1 goes to the secondary screen ' +
                'instead of hiding under the mirror. Windows already there when the mode ' +
                'turns on move to workspace 2, never to the room.'],
            ['share-shortcut', 'Share window shortcut',
                'The shortcut below sends the focused window to the secondary screen, or ' +
                'brings it back to the workspace it came from. Works with the mode off too.'],
        ],
    },
    {
        title: 'Alt+Tab',
        options: [
            ['switcher-secondary', 'Alt+Tab follows workspace 1',
                'On workspace 1, Alt+Tab lists only the windows the room sees. From a ' +
                'private workspace, picking one of them goes back to workspace 1. Off: ' +
                'GNOME\'s own Alt+Tab, untouched.'],
        ],
    },
    {
        title: 'Notifications',
        options: [
            ['mute-notifications', 'Do Not Disturb while presenting',
                'Notification banners stay off while the mode is on, and your previous ' +
                'setting comes back afterwards, even after a crash of GNOME Shell.'],
        ],
    },
];

export default class PresentationWorkspacePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Bindings live as long as the settings object: keep it with the window.
        window._settings = settings;

        const page = new Adw.PreferencesPage({
            description: 'Each option switches one behavior of the presentation mode on ' +
                'or off. They apply right away, even with the mode on.',
        });
        window.add(page);

        for (const {title, options} of GROUPS) {
            const group = new Adw.PreferencesGroup({title});
            page.add(group);
            for (const [key, rowTitle, subtitle] of options) {
                const row = new Adw.SwitchRow({title: rowTitle, subtitle});
                settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
                group.add(row);
                if (key === 'share-shortcut')
                    group.add(this._shortcutRow(window, settings));
            }
        }
    }

    /** The share-window key: click, then press the new combination. */
    _shortcutRow(window, settings) {
        const row = new Adw.ActionRow({
            title: 'Shortcut',
            subtitle: 'Click to change it',
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
        settings.bind('share-shortcut', row, 'sensitive', Gio.SettingsBindFlags.GET);
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
