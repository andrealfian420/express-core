// Purpose: Resolve one storage root for uploads, deletion and static serving.
// Caller: app.ts (static /storage), upload.middleware.ts, storage.service.ts.
// Dependencies: path, config/env (optional STORAGE_ROOT).
// Main Functions: storageRoot, uploadsRoot.
// Side Effects: None; paths are resolved once at import time.
// Notes: The default keeps the existing working-directory location
//   (client/storage/public); STORAGE_ROOT changes the filesystem root only, never public URLs.
import path from 'path'
import { env } from './env'

export const storageRoot = env.STORAGE_ROOT
  ? path.resolve(env.STORAGE_ROOT)
  : path.resolve(process.cwd(), 'client/storage/public')

export const uploadsRoot = path.join(storageRoot, 'uploads')
