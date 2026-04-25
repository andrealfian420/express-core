import { Response } from 'express'

/*
 * Utility function to send standardized JSON responses
 */
const response = (
  res: Response,
  data: any = null,
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
