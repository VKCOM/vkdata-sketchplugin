const send = require('sketch-module-google-analytics')

const key = 'UA-130190471-1'

export function sendEvent(context, category, action, label, value) {
  const payload = {}
  if (category) { payload.ec = category }
  if (action) { payload.ea = action }
  if (label) { payload.el = label }
  if (value) { payload.ev = value }
  return send(context, key, 'event', payload)
}

export function sendError(context, error) {
  return send(context, key, 'event', {exd: error})
}