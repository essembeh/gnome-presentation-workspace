#!/usr/bin/env node
// Unit tests over src/geometry.js, the only module free of gi:// imports.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
    center, contains, letterbox, mirrorView, pointerTarget, returnWorkspace, toMirrorPoint,
    toMirrorX, toSecondaryPoint, toSecondaryX, topEdge,
} from '../src/geometry.js';

test('toMirrorPoint / toSecondaryPoint: the pointer keeps its place in the mirror', () => {
    const secondary = {x: 0, y: 0, width: 1920, height: 1200};
    const view = mirrorView({x: 1920, y: 40, width: 3440, height: 1400}, secondary);
    const shown = toMirrorPoint(view, secondary, 960, 600);
    assert.deepEqual(shown, {x: view.x + 1120, y: view.y + 700});
    assert.deepEqual(toSecondaryPoint(view, secondary, shown.x, shown.y), {x: 960, y: 600});
});

test('toSecondaryPoint: black bands map to the edges, never onto the top row', () => {
    const secondary = {x: 0, y: 0, width: 1920, height: 1200};
    const view = mirrorView({x: 1920, y: 40, width: 3440, height: 1400}, secondary);
    assert.deepEqual(toSecondaryPoint(view, secondary, 1920, 0), {x: 0, y: 1});
    assert.deepEqual(toSecondaryPoint(view, secondary, 5359, 1439), {x: 1919, y: 1199});
});

test('contains / center', () => {
    const ext = {x: 1920, y: 0, width: 1920, height: 1080};
    assert.ok(contains(ext, 1920, 0));
    assert.ok(!contains(ext, 3840, 0));
    assert.ok(!contains(null, 0, 0));
    assert.deepEqual(center(ext), {x: 2880, y: 540});
});

test('pointerTarget: arriving on workspace 1 sends the pointer to the secondary screen', () => {
    assert.equal(pointerTarget(2, 0, false), 'secondary');
    assert.equal(pointerTarget(-1, 0, false), 'secondary');
});

test('pointerTarget: already on the secondary screen, it stays where it is', () => {
    assert.equal(pointerTarget(2, 0, true), null);
});

test('pointerTarget: leaving workspace 1 from the secondary screen brings it back', () => {
    assert.equal(pointerTarget(0, 2, true), 'primary');
});

test('pointerTarget: leaving workspace 1 from the primary screen (top bar scroll) does nothing', () => {
    assert.equal(pointerTarget(0, 2, false), null);
});

test('pointerTarget: switches between private workspaces never move it', () => {
    assert.equal(pointerTarget(1, 2, true), null);
    assert.equal(pointerTarget(1, 2, false), null);
});

test('letterbox: 16:9 secondary on a 16:10 primary work area gets bands top and bottom', () => {
    assert.deepEqual(letterbox(1920, 1168, 1920, 1080), {scale: 1, x: 0, y: 44, width: 1920, height: 1080});
});

test('letterbox: 4:3 secondary gets bands on the sides', () => {
    const fit = letterbox(1920, 1168, 1024, 768);
    assert.equal(fit.height, 1168);
    assert.equal(fit.width, 1557);
    assert.equal(fit.y, 0);
    assert.equal(fit.x, 181);
});

test('letterbox: 4K secondary is scaled down', () => {
    assert.equal(letterbox(1920, 1168, 3840, 2160).scale, 0.5);
});

test('returnWorkspace: back to the origin', () => {
    assert.equal(returnWorkspace(2, 1, 4, true), 2);
});

test('returnWorkspace: never the mirror workspace while the mode is on', () => {
    assert.equal(returnWorkspace(0, 0, 3, true), 1);
    assert.equal(returnWorkspace(undefined, 0, 3, true), 1);
    assert.equal(returnWorkspace(undefined, 2, 3, true), 2);
});

test('returnWorkspace: mode off, workspace 0 is fine', () => {
    assert.equal(returnWorkspace(0, 1, 3, false), 0);
    assert.equal(returnWorkspace(undefined, 0, 3, false), 0);
});

test('returnWorkspace: origin gone, falls back to the active workspace', () => {
    assert.equal(returnWorkspace(5, 2, 3, true), 2);
});

// 1920x1200 primary with a 32 px top bar, 1920x1080 secondary on its right.
const workArea = {x: 0, y: 32, width: 1920, height: 1168};
const secondary = {x: 1920, y: 0, width: 1920, height: 1080};
const view = mirrorView(workArea, secondary);

test('mirrorView: the secondary screen as drawn in the primary work area', () => {
    assert.equal(view.y, workArea.y + Math.floor((1168 - view.height) / 2));
    assert.equal(view.x + view.width / 2, 960);
});

test('toMirrorX / toSecondaryX: a column maps to the same place both ways', () => {
    assert.equal(toMirrorX(view, secondary, 1920), view.x);
    assert.equal(toMirrorX(view, secondary, 2880), 960);
    assert.equal(toSecondaryX(view, secondary, 960), 2880);
    assert.equal(toSecondaryX(view, secondary, toMirrorX(view, secondary, 3000)), 3000);
});

test('toSecondaryX: the black bands map to the sides of the secondary screen', () => {
    const narrow = mirrorView(workArea, {x: 1920, y: 0, width: 1024, height: 768});
    const sec = {x: 1920, y: 0, width: 1024, height: 768};
    assert.equal(toSecondaryX(narrow, sec, 0), 1920);
    assert.equal(toSecondaryX(narrow, sec, 1919), 1920 + 1023);
});

test('topEdge: side by side, the whole top edge', () => {
    const primary = {x: 0, y: 0, width: 1920, height: 1200};
    assert.deepEqual(topEdge(secondary, [primary, secondary]), [[1920, 3840]]);
});

test('topEdge: no barrier where a screen sits on top', () => {
    const below = {x: 0, y: 1200, width: 1920, height: 1080};
    const primary = {x: 960, y: 0, width: 1920, height: 1200};
    assert.deepEqual(topEdge(below, [primary, below]), [[0, 960]]);
});
