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
