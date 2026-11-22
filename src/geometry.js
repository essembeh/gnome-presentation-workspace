// Pure helpers, no gi:// import: this is the only module tests/unit.mjs can load.

/**
 * Fits a source size into a box, keeping its ratio, centered (letterbox).
 * Returns the scale and the fitted rectangle, relative to the box.
 */
export function letterbox(boxWidth, boxHeight, srcWidth, srcHeight) {
    const scale = Math.min(boxWidth / srcWidth, boxHeight / srcHeight);
    const width = Math.round(srcWidth * scale);
    const height = Math.round(srcHeight * scale);
    return {
        scale,
        x: Math.floor((boxWidth - width) / 2),
        y: Math.floor((boxHeight - height) / 2),
        width,
        height,
    };
}

export function contains(rect, x, y) {
    return rect !== null &&
        x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

export function center(rect) {
    return {x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2)};
}

/**
 * Where the pointer jumps on a workspace switch: 'secondary' when arriving on the
 * mirror workspace (0) from elsewhere, 'primary' when leaving it with the pointer
 * still on the secondary screen, null otherwise (switches between private workspaces).
 */
export function pointerTarget(previous, current, onSecondary) {
    if (current === 0 && previous !== 0 && !onSecondary)
        return 'secondary';
    if (current !== 0 && previous === 0 && onSecondary)
        return 'primary';
    return null;
}

/**
 * Workspace a shared window goes back to on the primary screen: where it came from, else the
 * active one — but never the mirror workspace (0) while the mode is on.
 */
export function returnWorkspace(origin, active, count, mirrorOn) {
    const avoid = mirrorOn ? 0 : -1;
    if (origin !== undefined && origin >= 0 && origin < count && origin !== avoid)
        return origin;
    if (active !== avoid)
        return active;
    return count > 1 ? 1 : active;
}

/** Stage rectangle of the secondary screen as drawn in the mirror, with its scale. */
export function mirrorView(workArea, secondary) {
    const fit = letterbox(workArea.width, workArea.height, secondary.width, secondary.height);
    return {
        x: workArea.x + fit.x,
        y: workArea.y + fit.y,
        width: fit.width,
        height: fit.height,
        scale: fit.scale,
    };
}

/** Where a secondary screen column appears in the mirror. */
export function toMirrorX(view, secondary, x) {
    return Math.round(view.x + (x - secondary.x) * view.scale);
}

/** The secondary screen column under a mirror column; the black bands map to its sides. */
export function toSecondaryX(view, secondary, x) {
    const column = Math.round(secondary.x + (x - view.x) / view.scale);
    return Math.min(Math.max(column, secondary.x), secondary.x + secondary.width - 1);
}

/** Where a point of the secondary screen appears in the mirror. */
export function toMirrorPoint(view, secondary, x, y) {
    return {
        x: toMirrorX(view, secondary, x),
        y: Math.round(view.y + (y - secondary.y) * view.scale),
    };
}

/**
 * The secondary screen point under a mirror point, black bands mapped to its edges.
 * Never on the top row: the top edge barrier would count the jump as a push.
 */
export function toSecondaryPoint(view, secondary, x, y) {
    const row = Math.round(secondary.y + (y - view.y) / view.scale);
    return {
        x: toSecondaryX(view, secondary, x),
        y: Math.min(Math.max(row, secondary.y + 1), secondary.y + secondary.height - 1),
    };
}

/**
 * Parts of the secondary screen's top edge with no monitor above, as [x1, x2] pairs:
 * a barrier there must not block the way to a screen stacked on top.
 */
export function topEdge(secondary, monitors) {
    let segments = [[secondary.x, secondary.x + secondary.width]];
    for (const monitor of monitors) {
        if (monitor === secondary || monitor.y + monitor.height !== secondary.y)
            continue;
        const left = monitor.x;
        const right = monitor.x + monitor.width;
        segments = segments
            .flatMap(([x1, x2]) => [[x1, Math.min(x2, left)], [Math.max(x1, right), x2]])
            .filter(([x1, x2]) => x2 > x1);
    }
    return segments;
}
