// Purpose: Manage uploaded files beneath the shared configurable storage root.
// Caller: user.service, profile.service and other module services handling uploads.
// Dependencies: fs, path, config/storage (uploadsRoot), utils/url (appUrl: APP_URL for public URLs).
// Main Functions: getPublicUrl, deleteFile, fileExists.
// Side Effects: Removes files beneath the configured upload directory.
import fs from 'fs'
import path from 'path'
import { uploadsRoot } from '../config/storage'
import { appUrl } from '../utils/url'

// This service provides methods to manage files in the storage, such as generating public URLs and deleting files.
class StorageService {
  // Callers pass the folder with or without slashes ('/uploads/avatars', 'uploads/avatars');
  // they are trimmed so the URL never contains '//'.
  getPublicUrl(folder: string, filename: string): string {
    return appUrl(`/storage/${folder.replace(/^\/+|\/+$/g, '')}/${filename}`)
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
