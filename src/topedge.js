import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {contains, mirrorView, toMirrorX, toSecondaryX, topEdge} from './geometry.js';

// Same feel as GNOME's hot corner: a push, not a touch.
const PRESSURE_THRESHOLD = 100;
const PRESSURE_TIMEOUT = 1000;
// The barrier is off while the pointer jumps, back on once the warp is done.
const REARM_MS = 300;

/**
 * Pushing the top edge of the secondary screen while workspace 1 shows it brings the
 * pointer to the top bar, right above its place in the mirror; leaving the top bar
 * downward then takes it back. Spec §4.9.
 *
 * A warp is a pointer motion for Mutter: barriers on its straight path stop it (ours,
 * which the pointer is pressed against, and GNOME's hot corner at the top-left of the
 * primary screen). So the barrier is dropped during the jump, and every jump goes
 * through the middle height of the screens, far from the top edge.
 */
export class TopEdge {
    /** `secondary()` and `visible()` come from the mode: the screen and the mirror's state. */
    constructor(secondary, visible) {
        this._secondary = secondary;
        this._visible = visible;
        this._pressure = null;
        this._barriers = [];
        this._rearmSourceId = 0;
        // null, 'arriving' (warped, not on the top bar yet), 'menu' (a top bar menu
        // opened: wait until the pointer is back on the top bar) or 'on' (way back armed).
        this._state = null;
        // GNOME's hot corner on the secondary screen, switched off while the mirror shows.
        this._corner = null;
        this._seat = global.stage.get_context().get_backend().get_default_seat();

        global.backend.get_cursor_tracker().connectObject(
            'position-invalidated', () => this._onPointerMoved(), this);
        // Rebuilt corners come back armed.
        Main.layoutManager.connectObject('hot-corners-changed', () => {
            this._corner = null;
            this.sync();
        }, this);
        this.update();
    }

    /** Rebuilds the barriers along the secondary screen's free top edge. */
    update() {
        this._disarm();
        const secondary = this._secondary();
        if (!secondary)
            return;
        // A fresh one each time: a triggered PressureBarrier waits for a 'left' that a
        // removed barrier never sends.
        this._pressure = new Layout.PressureBarrier(
            PRESSURE_THRESHOLD, PRESSURE_TIMEOUT, Shell.ActionMode.NORMAL);
        this._pressure.connectObject('trigger', () => this._toPanel(), this);
        for (const [x1, x2] of topEdge(secondary, Main.layoutManager.monitors)) {
            const barrier = new Meta.Barrier({
                backend: global.backend,
                x1, x2, y1: secondary.y, y2: secondary.y,
                directions: Meta.BarrierDirection.POSITIVE_Y,
            });
            this._pressure.addBarrier(barrier);
            this._barriers.push(barrier);
        }
        this.sync();
    }

    /**
     * Follows the mirror's visibility: while it shows, the secondary screen's top-left
     * hot corner would open the overview instead of reaching the top bar.
     */
    sync() {
        const visible = this._visible();
        if (visible && !this._corner) {
            const corner = Main.layoutManager.hotCorners[this._secondary()?.index] ?? null;
            corner?.setBarrierSize(0);
            this._corner = corner;
        } else if (!visible) {
            this._restoreCorner();
        }
    }

    /** Forgets a pending way back: workspace switch, overview. */
    reset() {
        this._state = null;
    }

    destroy() {
        global.backend.get_cursor_tracker().disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        this._restoreCorner();
        this._disarm();
    }

    _restoreCorner() {
        this._corner?.setBarrierSize(Main.layoutManager.panelBox.height);
        this._corner = null;
    }

    _disarm() {
        if (this._rearmSourceId)
            GLib.source_remove(this._rearmSourceId);
        this._rearmSourceId = 0;
        this._barriers.forEach(barrier => {
            this._pressure.removeBarrier(barrier);
            barrier.destroy();
        });
        this._barriers = [];
        this._pressure?.disconnectObject(this);
        this._pressure?.destroy();
        this._pressure = null;
    }

    /** Drops the barrier for the jump, then puts it back. */
    _rearmLater() {
        this._disarm();
        this._rearmSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REARM_MS, () => {
            this._rearmSourceId = 0;
            if (this._state === 'arriving')
                this._state = null;
            this.update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _view() {
        const workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        return mirrorView(workArea, this._secondary());
    }

    _panel() {
        const {x, y, width, height} = Main.layoutManager.panelBox;
        return {x, y, width, height};
    }

    _middleY(monitor) {
        return monitor.y + Math.floor(monitor.height / 2);
    }

    _toPanel() {
        if (!this._visible())
            return;
        const [x] = global.get_pointer();
        const secondary = this._secondary();
        const panel = this._panel();
        const target = Math.min(Math.max(toMirrorX(this._view(), secondary, x), panel.x),
            panel.x + panel.width - 1);
        this._rearmLater();
        this._state = 'arriving';
        this._seat.warp_pointer(x, this._middleY(secondary));
        this._seat.warp_pointer(target, panel.y + Math.floor(panel.height / 2));
    }

    _onPointerMoved() {
        if (this._state === null)
            return;
        const [x, y] = global.get_pointer();
        const panel = this._panel();
        // Panel menus drop over the mirror: going down into one is not going back. Once
        // it closes, the way back holds again from the top bar.
        const menuOpen = Boolean(Main.panel.menuManager.activeMenu);
        if (this._state !== 'on') {
            if (!menuOpen && contains(panel, x, y))
                this._state = 'on';
            return;
        }
        if (menuOpen) {
            this._state = 'menu';
            return;
        }
        if (contains(panel, x, y))
            return;
        this._state = null;
        const below = x >= panel.x && x < panel.x + panel.width && y >= panel.y + panel.height;
        if (!below || !this._visible())
            return;
        const secondary = this._secondary();
        const target = toSecondaryX(this._view(), secondary, x);
        const primary = Main.layoutManager.primaryMonitor;
        // Lands just under the edge: on it, the barrier would count the jump as a push.
        this._rearmLater();
        this._seat.warp_pointer(x, this._middleY(primary));
        this._seat.warp_pointer(target, this._middleY(secondary));
        this._seat.warp_pointer(target, secondary.y + 1);
    }
}
