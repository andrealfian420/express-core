// Purpose: Manage uploaded files beneath the shared configurable storage root.
// Caller: user.service, profile.service and other module services handling uploads.
// Dependencies: fs, path, config/storage (uploadsRoot), config/env (APP_URL for public URLs).
// Main Functions: getPublicUrl, deleteFile, fileExists.
// Side Effects: Removes files beneath the configured upload directory.
import fs from 'fs'
import path from 'path'
import { uploadsRoot } from '../config/storage'
import { env } from '../config/env'

// This service provides methods to manage files in the storage, such as generating public URLs and deleting files.
class StorageService {
  getPublicUrl(folder: string, filename: string): string {
    return `${env.APP_URL}/storage/${folder}/${filename}`
  }

  deleteFile(folder: string, filename: string): void {
    const filePath = path.join(uploadsRoot, folder, filename)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  fileExists(folder: string, filename: string): boolean {
    const filePath = path.join(uploadsRoot, folder, filename)

    return fs.existsSync(filePath)
  }
}

export default new StorageService()
