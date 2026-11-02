'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { APP_ID, taskbarIdentity, applyTaskbarIdentity } = require('../taskbar-identity');

test('each actual Hexora tab window has its own Windows taskbar identity and icon', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hexora-taskbar-test-'));
  try {
    assert.equal(taskbarIdentity(folder, null, 'linux'), null);

    const main = taskbarIdentity(folder, null, 'win32');
    const first = taskbarIdentity(folder, 17, 'win32');
    const second = taskbarIdentity(folder, 18, 'win32');
    assert.equal(main.appId, APP_ID);
    assert.equal(first.appId, APP_ID + '.tab.17');
    assert.equal(second.appId, APP_ID + '.tab.18');
    assert.equal(new Set([main.appId, first.appId, second.appId]).size, 3);
    assert.equal(new Set([main.iconPath, first.iconPath, second.iconPath]).size, 3);

    for (const file of [main.iconPath, first.iconPath, second.iconPath]) {
      const data = fs.readFileSync(file);
      assert.equal(data.readUInt16LE(2), 1); // .ico
      assert.equal(data.readUInt16LE(4), 1); // one PNG
      assert.equal(data.readUInt32LE(18), 22); // PNG begins after ICO header
      assert.equal(data.subarray(22, 30).toString('hex'), '89504e470d0a1a0a');
      assert.equal(data.readUInt32LE(14), data.length - 22);
    }
    assert.notDeepEqual(fs.readFileSync(first.iconPath), fs.readFileSync(second.iconPath));

    const calls = [];
    const window = {
      isDestroyed: () => false,
      setAppDetails: options => calls.push(['details', options]),
      setIcon: icon => calls.push(['icon', icon])
    };
    applyTaskbarIdentity(window, first, 'win32');
    assert.deepEqual(calls, [
      ['details', { appId: first.appId, appIconPath: first.iconPath, appIconIndex: 0 }],
      ['icon', first.iconPath]
    ]);
    applyTaskbarIdentity(window, second, 'linux');
    assert.equal(calls.length, 2);
    assert.throws(() => taskbarIdentity(folder, -1, 'win32'), /Invalid taskbar/);
  } finally {
    fs.rmSync(folder, { force: true, recursive: true });
  }
});
