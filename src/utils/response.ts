import { Response } from 'express'

/*
 * Utility function to send standardized JSON responses
  Using <T> to allow for generic typing of the data payload
 */
const response = <T>(
  res: Response,
  data: T | null = null,
  message: string = 'OK',
  statusCode: number = 200,
) => {
  res.status(statusCode).json({
    success: statusCode < 400,
    message,
    data,
  })
}

export default response
