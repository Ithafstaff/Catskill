import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCoordinates } from '../src/lib/coordinates.ts'

test('stored latitude/longitude converts to map longitude/latitude', () => {
  assert.deepEqual(parseCoordinates('41.650000, -74.650000'), [-74.65, 41.65])
  assert.deepEqual(parseCoordinates(' 0, 0 '), [0, 0])
  assert.deepEqual(parseCoordinates('-90, 180'), [180, -90])
})
test('rejects malformed and out-of-range coordinates instead of plotting them', () => {
  for (const value of ['', '91, 0', '0, -181', 'Infinity, 3', '1,2,3', 'https://maps.app.goo.gl/example', 'hello 40, -74']) {
    assert.equal(parseCoordinates(value), null, value)
  }
})
