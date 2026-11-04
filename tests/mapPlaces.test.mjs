import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceMiles, listingPlaces, shulPlaces } from '../src/lib/mapPlaces.ts'
const published = {
  id: 'published', name: 'Community Shul', address: '1 Main Street', city: 'Town', state: 'NY', zip: '12701',
  mapLocation: '41.65, -74.65', type: 'Shul', status: 'Published',
  primarySchedules: [{ id: 'primary', prayerType: 'Shacharis' }],
  locations: [{ id: 'annex', name: 'Annex', address: '41.66, -74.66', schedules: [{id:'annex-time',prayerType:'Mincha'}] }],
}
test('public pins exclude drafts, pending, rejected and archived listings', () => {
  const places = listingPlaces([published, ...['Draft', 'Pending Review', 'Rejected', 'Changes Requested', 'Archived'].map(status => ({ ...published, id: status, status }))])
  assert.equal(places.length, 2)
  assert.deepEqual(places[0].coordinates, [-74.65,41.65])
  assert.equal(places[0].listingId, 'published')
  assert.equal(places[1].id, 'published:annex')
  assert.equal(places[1].schedules[0].prayerType, 'Mincha')
  assert.equal(places[1].listingId, 'published')
})
test('addresses and Google share links never become invented coordinates', () => {
  for (const mapLocation of ['https://maps.app.goo.gl/example', '1 Main Street, Town, NY', '91, 0']) {
    assert.equal(listingPlaces([{...published, mapLocation}])[0].coordinates, null)
  }
})
test('Mikvahs have their own detail route and no additional Shul pins', () => {
  const places = listingPlaces([{...published, type:'Mikvah'}])
  assert.equal(places.length, 1)
  assert.equal(places[0].route, 'mikvah-detail')
})
test('straight-line distance uses longitude/latitude order, handles zero and dateline', () => {
  assert.equal(distanceMiles([-74,41],[-74,41]), 0)
  const nycToLondon = distanceMiles([-74.006,40.7128],[-0.1276,51.5072])
  assert.ok(nycToLondon > 3400 && nycToLondon < 3500)
  assert.ok(distanceMiles([179,0],[-179,0]) < 140)
})
test('published Shul at same address replaces a duplicate sourced pin', () => {
  const places = shulPlaces([{...published, address:'457 State Route 52',city:'Woodbourne',zip:'12788',locations:[]}])
  assert.equal(places.length, 3)
  assert.equal(places.filter(place => /457 State Route 52/.test(place.address)).length, 1)
})
