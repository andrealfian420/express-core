import fs from 'fs'
import path from 'path'

// This service provides methods to manage files in the storage, such as generating public URLs and deleting files.
class StorageService {
  getPublicUrl(folder: string, filename: string): string {
    return `${process.env.APP_URL}/storage/${folder}/${filename}`
  }

  deleteFile(folder: string, filename: string): void {
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

  fileExists(folder: string, filename: string): boolean {
    const filePath = path.join(
      process.cwd(),
      'client/storage/public/uploads',
      folder,
      filename,
    )

    return fs.existsSync(filePath)
  }
}

export default new StorageService()
