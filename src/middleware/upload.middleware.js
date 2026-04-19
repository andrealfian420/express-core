const multer = require('multer')
const path = require('path')
const crypto = require('crypto')
const fs = require('fs')

const STORAGE_PATH = path.join(process.cwd(), 'client/storage/public/uploads')

const MIME_EXT_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  // add more MIME types and their corresponding extensions as needed
}

// folder: e.g., 'avatars', 'documents'
function createUploader(folder, allowedTypes, maxSize = 2 * 1024 * 1024) {
  const uploadPath = path.join(STORAGE_PATH, folder)

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true })
  }

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadPath)
    },

    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname)

      const filename = crypto.randomBytes(16).toString('hex') + ext

      cb(null, filename)
    },
  })

  const fileFilter = (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'), false)
    }

    // validate file extension as well to prevent spoofing
    const ext = path.extname(file.originalname).toLowerCase()
    const validExts = allowedTypes.map((type) => {
      const mimeExt = MIME_EXT_MAP[type]
      return mimeExt
    })

    if (!validExts.includes(ext)) {
      return cb(new Error('Invalid file extension'), false)
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

module.exports = {
  createUploader,
}
