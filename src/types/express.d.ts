//  This file is used to extend the Express Request Interface to include our custom properties.

// export empty object to convert this file into a module and avoid polluting the global namespace
export {}

export interface RoleData {
  id: string | number
  slug: string
  access: string[] // Array of permission strings
}

export interface CachedUserData {
  id: string | number
  role: RoleData | null
}

// declare global to extend the Express namespace and its Request interface
declare global {
  namespace Express {
    export interface Request {
      user?: {
        sub?: number
      }
      role?: RoleData
    }
  }
}
