import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newerCastlabs } from '../src/enginewatch.ts';

const tags = [{ tag: 'v44.5.1+wvcus', prerelease: false }, { tag: 'v43.7.7+wvcus', prerelease: false }, { tag: 'v45.0.0-alpha.3+wvcus', prerelease: true }];
test('engine watch: nothing newer than the newest stable castLabs release', () => {
  assert.equal(newerCastlabs(tags, '44.5.1'), null);
});
test('engine watch: a newer patch or major is found; alphas and other builds are not', () => {
  assert.equal(newerCastlabs([...tags, { tag: 'v44.7.2+wvcus', prerelease: false }], '44.5.1'), '44.7.2');
  assert.equal(newerCastlabs([...tags, { tag: 'v45.1.0+wvcus', prerelease: false }], '44.5.1'), '45.1.0');
  assert.equal(newerCastlabs([{ tag: 'v45.0.0-alpha.3+wvcus', prerelease: false }, { tag: 'v44.9.9', prerelease: false }], '44.5.1'), null);
});
