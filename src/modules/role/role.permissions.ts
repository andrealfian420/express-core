// Purpose: RBAC permission definitions. ACCESS_LIST is the structured tree shown in the role
//   editor; PERMISSIONS is the constant map used by checkPermission(); ALL_PERMISSIONS lists
//   every valid value.
// Caller: Module routes (checkPermission), role.service (_validateAccess), role.controller
//   (access list), seeders/role.seeder (super-admin grants), test fixtures.
// Dependencies: None.
// Main Functions: ACCESS_LIST, PERMISSIONS, ALL_PERMISSIONS.
// Side Effects: None.
// Notes: Extension point for new modules: add the module's group to ACCESS_LIST and the same
//   values to PERMISSIONS (a unit test keeps both in sync); the next seed run grants new values
//   to super-admin without touching other roles.

export interface PermissionActivity {
  label: string
  value: string
}

export interface PermissionSubModule {
  module: string
  activities: PermissionActivity[]
}

export interface PermissionModule {
  module: string
  sub_module: PermissionSubModule[]
}

const ACCESS_LIST: PermissionModule[] = [
  {
    module: 'Dashboard',
    sub_module: [
      {
        module: 'Dashboard',
        activities: [
          { label: 'Menu Dashboard', value: 'module.dashboard.index' },
        ],
      },
    ],
  },
  {
    module: 'Data Master',
    sub_module: [
      {
        module: 'Role',
        activities: [
          { label: 'Menu Role', value: 'module.master-data.role.index' },
          { label: 'Add Role', value: 'module.master-data.role.create' },
          { label: 'Edit Role', value: 'module.master-data.role.edit' },
          { label: 'Delete Role', value: 'module.master-data.role.delete' },
        ],
      },
      {
        module: 'User',
        activities: [
          { label: 'Menu User', value: 'module.master-data.user.index' },
          { label: 'Add User', value: 'module.master-data.user.create' },
          { label: 'Edit User', value: 'module.master-data.user.edit' },
          { label: 'Delete User', value: 'module.master-data.user.delete' },
        ],
      },
    ],
  },
  {
    module: 'History',
    sub_module: [
      {
        module: 'Activity Log',
        activities: [
          {
            label: 'Menu Activity Log',
            value: 'module.activity-log.index',
          },
          {
            label: 'Activity Log Details',
            value: 'module.activity-log.detail',
          },
        ],
      },
    ],
  },
]

// Flat constant map – use these in checkPermission() calls
const PERMISSIONS = {
  DASHBOARD: {
    INDEX: 'module.dashboard.index',
  },
  DATA_MASTER: {
    ROLE: {
      INDEX: 'module.master-data.role.index',
      CREATE: 'module.master-data.role.create',
      EDIT: 'module.master-data.role.edit',
      DELETE: 'module.master-data.role.delete',
    },
    USER: {
      INDEX: 'module.master-data.user.index',
      CREATE: 'module.master-data.user.create',
      EDIT: 'module.master-data.user.edit',
      DELETE: 'module.master-data.user.delete',
    },
  },
  ACTIVITY_LOG: {
    INDEX: 'module.activity-log.index',
    DETAIL: 'module.activity-log.detail',
  },
} as const

// Derive a flat array of all valid permission values from ACCESS_LIST
const ALL_PERMISSIONS: string[] = ACCESS_LIST.flatMap((mod) =>
  mod.sub_module.flatMap((sub) => sub.activities.map((a) => a.value)),
)

export { ACCESS_LIST, PERMISSIONS, ALL_PERMISSIONS }
