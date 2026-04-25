import { Request, Response, NextFunction } from 'express'
import multer, { Field, FileFilterCallback } from 'multer'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs'

const STORAGE_PATH = path.join(process.cwd(), 'client/storage/public/uploads')

// Set type as Record<string, string>
// to avoid TypeScript error when accessing MIME_EXT_MAP with a dynamic key
const MIME_EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  // add more MIME types and their corresponding extensions as needed
}

export interface FieldConfig {
  name: string
  folder: string
  allowedTypes: string[]
  maxSize: number
}

// folder: e.g., 'avatars', 'documents'
function createUploader(
  folder: string,
  allowedTypes: string[],
  maxSize: number = 2 * 1024 * 1024,
) {
  const uploadPath = path.join(STORAGE_PATH, folder)

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true })
  }

  const storage = multer.diskStorage({
    destination: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
      cb(null, uploadPath)
    },

    filename: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
      const ext = path.extname(file.originalname)

      const filename = crypto.randomBytes(16).toString('hex') + ext

      cb(null, filename)
    },
  })

  const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'))
    }

    // validate file extension as well to prevent spoofing
    const ext = path.extname(file.originalname).toLowerCase()
    const validExts = allowedTypes.map((type) => {
      const mimeExt = MIME_EXT_MAP[type]
      return mimeExt
    })

    if (!validExts.includes(ext)) {
      return cb(new Error('Invalid file extension'))
    }

    cb(null, true)
  }

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxSize,
    },
  })
}

/**
 * Create a multer middleware that handles multiple file fields, each with its
 * own folder, allowed MIME types, and maximum file size.
 *
 * @param {Array<{ name: string, folder: string, allowedTypes: string[], maxSize: number }>} fieldConfigs
 * @returns {Function} Express middleware
 */
function createFieldsUploader(fieldConfigs: FieldConfig[]) {
  // Create a map for quick lookup of field configurations by field name
  const configMap: Record<string, FieldConfig> = Object.fromEntries(
    fieldConfigs.map((c) => [c.name, c]),
  )

  // Ensure all upload directories exist
  // if not, create them
  fieldConfigs.forEach(({ folder }) => {
    const uploadPath = path.join(STORAGE_PATH, folder)
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true })
    }
  })

  // Set up multer storage and file filter
  const storage = multer.diskStorage({
    destination(
      req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, destination: string) => void,
    ) {
      const cfg = configMap[file.fieldname]
      cb(null, path.join(STORAGE_PATH, cfg ? cfg.folder : 'misc'))
    },
    filename(
      req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, filename: string) => void,
    ) {
      const ext = path.extname(file.originalname)
      cb(null, crypto.randomBytes(16).toString('hex') + ext)
    },
  })

  // Validate file type and extension based on the field's allowedTypes
  const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    const cfg = configMap[file.fieldname]
    if (!cfg) {
      return cb(new Error('Unexpected field'))
    }

    if (!cfg.allowedTypes.includes(file.mimetype)) {
      return cb(new Error(`Invalid file type for field "${file.fieldname}"`))
    }

    // validate file extension as well to prevent spoofing
    const ext = path.extname(file.originalname).toLowerCase()
    const validExts = cfg.allowedTypes.map((t) => MIME_EXT_MAP[t])
    if (!validExts.includes(ext)) {
      return cb(
        new Error(`Invalid file extension for field "${file.fieldname}"`),
      )
    }

    cb(null, true)
  }

  // Use the largest maxSize as the global multer limit; per-field check is done after upload
  const maxFileSize = Math.max(...fieldConfigs.map((c) => c.maxSize))

  // Set up multer to handle the specified fields
  const multerUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: maxFileSize },
  }).fields(fieldConfigs.map((config) => ({ name: config.name, maxCount: 1 })))

  return function (req: Request, res: Response, next: NextFunction) {
    multerUpload(req, res, (err: any) => {
      if (err) {
        return next(err)
      }

      // Per-field size enforcement
      if (req.files) {
        const filesObj = req.files as {
          [fieldname: string]: Express.Multer.File[]
        }
        for (const [fieldname, files] of Object.entries(filesObj)) {
          const cfg = configMap[fieldname]
          if (cfg && files[0] && files[0].size > cfg.maxSize) {
            fs.unlink(files[0].path, () => {})
            return next(
              new Error(
                `File "${fieldname}" exceeds the maximum allowed size of ${cfg.maxSize / (1024 * 1024)}MB`,
              ),
            )
          }
        }
      }

      next()
    })
  }
}

export { createUploader, createFieldsUploader }
