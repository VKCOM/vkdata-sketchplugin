// https://github.com/mathieudutour/sketch-module-google-analytics

let Settings = require('sketch/settings')

let kUUIDKey = 'google.analytics.uuid'
let uuid = NSUserDefaults.standardUserDefaults().objectForKey(kUUIDKey)
if (!uuid) {
  uuid = NSUUID.UUID().UUIDString()
  NSUserDefaults.standardUserDefaults().setObject_forKey(uuid, kUUIDKey)
}

let variant = MSApplicationMetadata.metadata().variant
let source = 'Sketch ' + (variant === 'NONAPPSTORE' ? '' : variant + ' ') + Settings.version.sketch

function jsonToQueryString (json) {
  return Object.keys(json)
    .map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(json[key])
    })
    .join('&')
}

function makeRequest (url, options) {
  if (!url) {
    return
  }

  if (options && options.makeRequest) {
    return options.makeRequest(url)
  }
  if (options && options.debug) {
    let request = NSURLRequest.requestWithURL(url)
    let responsePtr = MOPointer.alloc().init()
    let errorPtr = MOPointer.alloc().init()

    let data = NSURLConnection.sendSynchronousRequest_returningResponse_error(request, responsePtr, errorPtr)
    return data ? NSString.alloc().initWithData_encoding(data, NSUTF8StringEncoding) : errorPtr.value()
  }

  NSURLSession.sharedSession()
    .dataTaskWithURL(url)
    .resume()
}

module.exports = function (trackingId, hitType, props, options) {
  let payload = {
    v: 1,
    tid: trackingId,
    ds: source,
    cid: uuid,
    t: hitType
  }

  if (typeof __command !== 'undefined') {
    payload.an = __command.pluginBundle().name()
    payload.aid = __command.pluginBundle().identifier()
    payload.av = __command.pluginBundle().version()
  }

  if (props) {
    Object.keys(props).forEach(function (key) {
      payload[key] = props[key]
    })
  }

  let url = NSURL.URLWithString(
    'https://www.google-analytics.com/' + (options && options.debug ? 'debug/' : '') + 'collect?' + jsonToQueryString(payload) + '&z=' + NSUUID.UUID().UUIDString()
  )

  return makeRequest(url, options)
}
