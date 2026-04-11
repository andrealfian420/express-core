const morgan = require('morgan')

morgan.token('request-time', function (req, res) {
  return `${new Date().getTime()} - ${new Date().toISOString()}`
})

morgan.token('request-device', function (req, res) {
  return req.DeviceType
})

module.exports =
  ':request-time :remote-addr :request-device ":method :url" :status :response-time ms'
