import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {contains, letterbox} from './geometry.js';

const DOT_SIZE = 18;

/**
 * Read-only live copy of the secondary monitor, drawn over the primary work area.
 * Clones global.window_group (windows + backgrounds), never uiGroup: the mirror
 * itself lives in uiGroup, cloning it would make it contain itself.
 */
export const Mirror = GObject.registerClass(
class Mirror extends St.Widget {
    _init() {
        // Reactive so clicks die here instead of reaching hidden windows below.
        super._init({style_class: 'presentation-mirror', reactive: true, visible: false});

        this._viewport = new St.Widget({clip_to_allocation: true});
        this.add_child(this._viewport);

        this._clone = new Clutter.Clone({source: global.window_group});
        this._viewport.add_child(this._clone);

        this._dot = new St.Widget({
            style_class: 'presentation-cursor',
            width: DOT_SIZE,
            height: DOT_SIZE,
            visible: false,
        });
        this._viewport.add_child(this._dot);

        this._secondary = null;
        this._scale = 1;
    }

    /** Primary work area and secondary monitor rectangles, in stage coordinates. */
    setGeometry(workArea, secondary) {
        this._secondary = secondary;
        this.set_position(workArea.x, workArea.y);
        this.set_size(workArea.width, workArea.height);

        const fit = letterbox(workArea.width, workArea.height, secondary.width, secondary.height);
        this._scale = fit.scale;
        this._viewport.set_position(fit.x, fit.y);
        this._viewport.set_size(fit.width, fit.height);
        this._clone.set_scale(fit.scale, fit.scale);
        this._clone.set_position(-secondary.x * fit.scale, -secondary.y * fit.scale);
    }

    /** Moves the cursor dot to a stage position, hidden outside the secondary monitor. */
    setPointer(x, y) {
        const sec = this._secondary;
        const inside = contains(sec, x, y);
        this._dot.visible = inside;
        if (inside) {
            this._dot.set_position(
                Math.round((x - sec.x) * this._scale - DOT_SIZE / 2),
                Math.round((y - sec.y) * this._scale - DOT_SIZE / 2));
        }
    }
});
