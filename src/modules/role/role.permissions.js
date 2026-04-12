/**
 * RBAC Permission Definitions
 *
 * ACCESS_LIST – full structured tree (used for UI/API display)
 * PERMISSIONS  – flat constant map (used in code for checkPermission())
 */

const ACCESS_LIST = [
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
        module: 'Activity History',
        activities: [
          {
            label: 'Menu Activity History',
            value: 'module.log-activity.index',
          },
          {
            label: 'Activity History Details',
            value: 'module.log-activity.detail',
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
  LOG_ACTIVITY: {
    INDEX: 'module.log-activity.index',
    DETAIL: 'module.log-activity.detail',
  },
}

// Derive a flat array of all valid permission values from ACCESS_LIST
const ALL_PERMISSIONS = ACCESS_LIST.flatMap((mod) =>
  mod.sub_module.flatMap((sub) => sub.activities.map((a) => a.value)),
)

module.exports = { ACCESS_LIST, PERMISSIONS, ALL_PERMISSIONS }
