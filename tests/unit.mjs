#!/usr/bin/env node
// Unit tests over src/geometry.js, the only module free of gi:// imports.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
    center, contains, letterbox, pointerTarget, returnWorkspace,
} from '../src/geometry.js';

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
