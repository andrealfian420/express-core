const fs = require('fs')
const path = require('path')

// This service provides methods to manage files in the storage, such as generating public URLs and deleting files.
class StorageService {
  getPublicUrl(folder, filename) {
    return `${process.env.APP_URL}/storage/${folder}/${filename}`
  }

  deleteFile(folder, filename) {
    const filePath = path.join(
      process.cwd(),
      'client/storage/public/uploads',
      folder,
      filename,
    )

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  fileExists(folder, filename) {
    const filePath = path.join(
      process.cwd(),
      'client/storage/public/uploads',
      folder,
      filename,
    )

    return fs.existsSync(filePath)
  }
}

module.exports = new StorageService()
