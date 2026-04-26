import { Request, Response } from 'express'
import morgan from 'morgan'

interface LogRequest extends Request {
  DeviceType?: string
}

morgan.token('request-time', function (req: Request, res: Response) {
  return `${new Date().getTime()} - ${new Date().toISOString()}`
})

morgan.token('request-device', function (req: LogRequest, res: Response) {
  return req.DeviceType || 'Unknown Device'
})

const logFormat =
  ':request-time :remote-addr :request-device ":method :url" :status :response-time ms'

export default logFormat
