// https://github.com/mathieudutour/sketch-module-google-analytics

const track = require('../src/analytics.js')

function makeRequest (url) {
  return String(url.absoluteString())
}

let userId = null

test('should create a new user Id if not present', () => {
  NSUserDefaults.standardUserDefaults().removeObjectForKey("google.analytics.uuid")
  const url = track('trackingId', 'event', {}, { makeRequest })
  userId = url.split('cid=')[1].split('&')[0]
  expect(userId).toHaveLength(36)
})

test('should use the same user Id if already present', () => {
  const url = track('trackingId', 'event', {}, { makeRequest })
  const newUserId = url.split('cid=')[1].split('&')[0]
  expect(newUserId).toBe(userId)
})

test('should debug', () => {
  expect(track('trackingId', 'event', {}, { makeRequest, debug: true })).toMatch('https://www.google-analytics.com/debug/collect?v=1&tid=trackingId&ds=Sketch')
  expect(String(track('trackingId', 'event', {}, { debug: true }))).toMatch('The value provided for parameter \'tid\' is invalid')
})