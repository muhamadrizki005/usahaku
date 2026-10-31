import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assistantFloatingLayout, launcherSize } from '../lib/assistant-floating'

test('floating assistant stays within viewport across corners, offscreen drags, orientation and keyboard bounds', () => {
  for (const viewport of [{ x: 0, y: 0, width: 1440, height: 900 }, { x: 0, y: 0, width: 320, height: 844 }, { x: 0, y: 0, width: 844, height: 390 }, { x: 0, y: 80, width: 390, height: 320 }, { x: 12, y: 30, width: 360, height: 220 }]) {
    for (const point of [null, { x: -1000, y: -1000 }, { x: 99999, y: 99999 }, { x: viewport.width / 2, y: viewport.height / 2 }, { x: 20, y: viewport.height - 80 }, { x: viewport.width - 80, y: 20 }]) {
      const { launcher, panel } = assistantFloatingLayout(viewport, point)
      for (const box of [{ ...launcher, width: launcherSize, height: launcherSize }, panel]) {
        assert.ok(box.x >= viewport.x + 16); assert.ok(box.y >= viewport.y + 16)
        assert.ok(box.x + box.width <= viewport.x + viewport.width - 16)
        assert.ok(box.y + box.height <= viewport.y + viewport.height - 16)
      }
    }
  }
})

test('chat chooses space below a top launcher, above a bottom launcher and beside a middle desktop launcher', () => {
  const viewport = { x: 0, y: 0, width: 1440, height: 600 }
  const top = assistantFloatingLayout(viewport, { x: 1300, y: 16 }), bottom = assistantFloatingLayout(viewport, null), middle = assistantFloatingLayout(viewport, { x: 1300, y: 270 })
  assert.ok(top.panel.y >= top.launcher.y + launcherSize)
  assert.ok(bottom.panel.y + bottom.panel.height <= bottom.launcher.y)
  assert.ok(middle.panel.x + middle.panel.width < middle.launcher.x)
})
