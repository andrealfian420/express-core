import { Request, Response, NextFunction } from 'express'
import xss from 'xss'

const sanitizeInput = (obj: any): any => {
  try {
    if (typeof obj !== 'object' || obj === null) {
      if (typeof obj === 'string') {
        return xss(obj)
      } else {
        return obj
      }
    }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = sanitizeInput(obj[key])
      }
    }
    return obj
  } catch (err: any) {
    console.error(`Error sanitizing object: ${err}`)
    return obj // or return an empty object, depending on your requirements
  }
}

const xssMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize all parts of the request except `markdown` field
  if (req.body && req.body.markdown) {
    // Leave markdown field unsanitized
    const markdown = req.body.markdown
    delete req.body.markdown
    sanitizeInput(req.body)
    req.body.markdown = markdown
  } else {
    req.body = sanitizeInput(req.body)
  }

  if (req.query) {
    sanitizeInput(req.query)
  }
  if (req.params) {
    sanitizeInput(req.params)
  }
  if (req.cookies) {
    sanitizeInput(req.cookies)
  }
  if (req.url) {
    sanitizeInput(req.url)
  }

  // Sanitize responses
  res.locals.safeOutput = sanitizeInput(res.locals.safeOutput)

  next()
}

export default xssMiddleware
