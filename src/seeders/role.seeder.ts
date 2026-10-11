// Purpose: Seed the Super Administrator role. A missing role is created with every permission;
//   on later runs only permission values it does not have yet (e.g. from a newly added module)
//   are granted. Nothing is removed and the title/description are never changed.
// Caller: src/seeders/index.ts (seed runner), admin-user.seeder (role lookup), integration tests.
// Dependencies: Prisma Client, role.permissions (ALL_PERMISSIONS), role.user-types (UserType).
// Main Functions: roleSeeder (default), grantPermissions, findSuperAdminRole, SUPER_ADMIN_SLUG.
// Side Effects: INSERT into roles, or one UPDATE that appends missing access values.
import { PrismaClient, Role } from '@prisma/client'
import { ALL_PERMISSIONS } from '../modules/role/role.permissions'
import { UserType } from '../modules/role/role.user-types'
import { Seeder } from './seeder.types'

export const SUPER_ADMIN_SLUG = 'super-admin'

export async function findSuperAdminRole(db: PrismaClient): Promise<Role | null> {
  return await db.role.findFirst({
    where: { slug: SUPER_ADMIN_SLUG, deletedAt: null },
  })
}

// Appends what the role lacks in a single statement evaluated under the row lock, against the
// committed access list: an edit saved in the role editor meanwhile is kept, not overwritten
// by the value read here. Returns the values that were missing; writes nothing when none are.
export async function grantPermissions(
  db: PrismaClient,
  role: Role,
  permissions: string[],
): Promise<string[]> {
  const current = Array.isArray(role.access) ? role.access : []
  const missing = permissions.filter((value) => !current.includes(value))
  if (missing.length === 0) return []

  await db.$executeRaw`
    UPDATE "roles"
    SET "access" = "access" || COALESCE((
          SELECT jsonb_agg(granted.value ORDER BY granted.ordinality)
          FROM jsonb_array_elements_text(${JSON.stringify(missing)}::jsonb)
               WITH ORDINALITY AS granted(value, ordinality)
          WHERE NOT ("roles"."access" ? granted.value)
        ), '[]'::jsonb),
        "updated_at" = now()
    WHERE "id" = ${role.id}
  `
  return missing
}

const roleSeeder: Seeder = {
  name: 'role',
  description: 'Super Administrator role holding every permission',
  async run(db) {
    const role = await findSuperAdminRole(db)
    if (!role) {
      await db.role.create({
        data: {
          slug: SUPER_ADMIN_SLUG,
          title: 'Super Administrator',
          userType: 'Administrator' satisfies UserType,
          description: 'Full access to all modules',
          access: ALL_PERMISSIONS,
        },
      })
      return `created ${SUPER_ADMIN_SLUG} with ${ALL_PERMISSIONS.length} permissions`
    }

    const granted = await grantPermissions(db, role, ALL_PERMISSIONS)
    return granted.length
      ? `granted ${granted.length} new permission(s) to ${SUPER_ADMIN_SLUG}: ${granted.join(', ')}`
      : `${SUPER_ADMIN_SLUG} already holds every permission; left unchanged`
  },
}

export default roleSeeder
