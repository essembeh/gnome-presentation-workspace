import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {nearestCorner} from './geometry.js';
import {Mirror} from './mirror.js';

const DOUBLE_CLICK_MS = 400;
const DRAG_THRESHOLD = 4;

/** The mirror in a corner of a private workspace: drag it to a corner, double-click to open. */
export const Pip = GObject.registerClass(
class Pip extends Mirror {
    _init(onCorner, onOpen) {
        super._init();
        this._onCorner = onCorner;
        this._onOpen = onOpen;
        this._grab = null;
        this._press = null;
        this._lastClick = 0;

        this.connect('button-press-event', (_actor, event) => this._onPress(event));
        this.connect('motion-event', (_actor, event) => this._onMotion(event));
        this.connect('button-release-event', (_actor, event) => this._onRelease(event));
        // A grab left behind would swallow all input: it never outlives the visible actor.
        this.connect('notify::mapped', () => {
            if (!this.mapped && this._grab) {
                this.set_position(this._press.x, this._press.y);
                this._endDrag();
            }
        });
        this.connect('destroy', () => this._endDrag());
    }

    _onPress(event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY || this._grab)
            return Clutter.EVENT_STOP;
        const time = event.get_time();
        if (time - this._lastClick <= DOUBLE_CLICK_MS) {
            this._lastClick = 0;
            this._onOpen(time);
            return Clutter.EVENT_STOP;
        }
        this._lastClick = time;
        const [pointerX, pointerY] = event.get_coords();
        this._press = {x: this.x, y: this.y, pointerX, pointerY, moved: false};
        this._grab = global.stage.grab(this);
        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        if (!this._grab)
            return Clutter.EVENT_PROPAGATE;
        const press = this._press;
        const [x, y] = event.get_coords();
        const dx = x - press.pointerX;
        const dy = y - press.pointerY;
        if (!press.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD)
            return Clutter.EVENT_STOP;
        press.moved = true;
        this._lastClick = 0;
        const area = this._workArea();
        this.set_position(
            Math.round(Math.min(Math.max(press.x + dx, area.x), area.x + area.width - this.width)),
            Math.round(Math.min(Math.max(press.y + dy, area.y), area.y + area.height - this.height)));
        return Clutter.EVENT_STOP;
    }

    _onRelease(event) {
        if (!this._grab || event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_STOP;
        const {moved} = this._press;
        this._endDrag();
        if (moved) {
            this._onCorner(nearestCorner(this._workArea(),
                this.x + this.width / 2, this.y + this.height / 2));
        }
        return Clutter.EVENT_STOP;
    }

    _endDrag() {
        this._grab?.dismiss();
        this._grab = null;
        this._press = null;
    }

    _workArea() {
        return Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
    }
});
