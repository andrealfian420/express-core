// Purpose: Extend Express Request with authentication/RBAC fields and declare the cached RBAC
//   user shape.
// Caller: auth.middleware, rbac.middleware, rbac-cache.service, controllers reading req.user.
// Dependencies: Express namespace.
// Main Functions: RoleData, CachedUserData, Express.Request augmentation.
// Side Effects: None (type declarations only).
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
  // RBAC version read before the database lookup (see services/rbac-cache.service.ts).
  rbacVersion?: number
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
