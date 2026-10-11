// Purpose: Role management business logic: list, show, create, update and delete roles with
//   permission validation, audit logging and RBAC cache invalidation.
// Caller: role.controller.
// Dependencies: role.repository, Prisma transactions, cache.service, rbac-cache.service,
//   role.permissions, sluggable, system.service (activity log).
// Main Functions: getRoles, getRole, createRole, updateRole, deleteRole, _validateAccess.
// Side Effects: Writes roles and activity logs; after commit bumps the RBAC version (every
//   cached access entry becomes stale), then deletes the cached RBAC/profile entries of the
//   role's tracked users in one Redis call and untracks only those users.
import { Request } from 'express'
import prisma from '../../config/database'
import { Prisma, Role } from '@prisma/client'
import AppError from '../../utils/appError'
import roleRepository from './role.repository'
import cacheService from '../../services/cache.service'
import { invalidateAccess } from '../../services/rbac-cache.service'
import { ALL_PERMISSIONS } from './role.permissions'
import { makeUniqueSlug } from '../../utils/sluggable'
import systemService from '../../services/system.service'
import { PaginatedResult } from '../../utils/paginator'
import { PrismaTx } from '../../types/prisma'

const cacheKey = (id: string | number): string => `role:${id}`

// Invalidates access first (version bump: correct even for entries written concurrently),
// then frees the cached access and profile (which embeds the role) of every user the RBAC
// middleware tracked for this role. srem removes only the members read here: a user cached
// concurrently stays tracked, so the next role change still drops their profile.
async function invalidateRoleUsers(roleId: number): Promise<void> {
  await invalidateAccess()
  const setKey = `role-users:${roleId}`
  const userIds = await cacheService.smembers(setKey)
  await cacheService.del(
    ...userIds.flatMap((userId) => [`user-role:${userId}`, `profile:${userId}`]),
  )
  await cacheService.srem(setKey, userIds)
}

// Service layer for Role management
class RoleService {
  async getRoles(req: Request): Promise<PaginatedResult<Role>> {
    return await roleRepository.getRoles(req)
  }

  async getRole(slug: string): Promise<Role | null> {
    const role = await roleRepository.findBySlug(slug)
    if (!role) {
      throw new AppError('Role not found', 404)
    }

    return role
  }

  async createRole(
    data: Prisma.RoleCreateInput,
    createdBy: number | null = null,
  ): Promise<Role> {
    this._validateAccess(data.access as string[])

    // Use transaction to ensure role creation and activity logging are atomic
    const role = await prisma.$transaction(async (tx: PrismaTx) => {
      const slug = await makeUniqueSlug(data.title, (candidate, excludeId) =>
        roleRepository.findBySlugExcluding(candidate, excludeId as number, tx),
      )

      const newRole = await roleRepository.create(
        {
          slug,
          title: data.title,
          userType: data.userType,
          description: data.description ?? null,
          access: data.access,
        },
        tx,
      )

      // Log activity within transaction
      await systemService.logActivity(
        createdBy,
        'CREATE',
        'Role',
        newRole.id,
        `Role created: ${newRole.title}`,
        null,
        {
          title: newRole.title,
          userType: newRole.userType,
          slug: newRole.slug,
          access: newRole.access,
        },
        tx,
      )

      return newRole
    })

    return role
  }

  async updateRole(
    slug: string,
    data: Prisma.RoleUpdateInput,
    updatedBy: number | null = null,
  ): Promise<Role> {
    const role = await roleRepository.findBySlug(slug)

    if (!role) {
      throw new AppError('Role not found', 404)
    }

    if (data.access) {
      this._validateAccess(data?.access as string[])
    }

    // Use transaction to ensure role update and activity logging are atomic
    const updated = await prisma.$transaction(async (tx: PrismaTx) => {
      // onUpdate: regenerate slug whenever title changes
      let newSlug
      if (data.title && data.title !== role.title) {
        newSlug = await makeUniqueSlug(
          data.title as string,
          (candidate, excludeId) =>
            roleRepository.findBySlugExcluding(
              candidate,
              excludeId as number,
              tx,
            ),
          role.id,
        )
      }

      const updatedRole = await roleRepository.update(
        role.id,
        {
          ...(data.title && { title: data.title }),
          ...(newSlug && { slug: newSlug }),
          ...(data.userType && { userType: data.userType }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.access && { access: data.access as string[] }),
        },
        tx,
      )

      // Log activity within transaction
      await systemService.logActivity(
        updatedBy,
        'UPDATE',
        'Role',
        role.id,
        `Role updated: ${updatedRole.title}`,
        {
          title: role.title,
          userType: role.userType,
          slug: role.slug,
          access: role.access,
        },
        {
          title: updatedRole.title,
          userType: updatedRole.userType,
          slug: updatedRole.slug,
          access: updatedRole.access,
        },
        tx,
      )

      return updatedRole
    })

    // Clear caches AFTER transaction succeeds
    await cacheService.del(cacheKey(role.slug))
    await invalidateRoleUsers(role.id)

    return updated
  }

  async deleteRole(
    slug: string,
    deletedBy: number | null = null,
  ): Promise<void> {
    const role = await roleRepository.findBySlug(slug)
    if (!role) {
      throw new AppError('Role not found', 404)
    }

    const userCount = await roleRepository.countUsers(role.id)

    if (userCount > 0) {
      throw new AppError(
        `Cannot delete role: ${userCount} user(s) are still assigned to this role`,
        409,
      )
    }

    // Use transaction to ensure role deletion and activity logging are atomic
    await prisma.$transaction(async (tx: PrismaTx) => {
      await roleRepository.delete(role.id, tx)

      // Log activity within transaction
      await systemService.logActivity(
        deletedBy,
        'DELETE',
        'Role',
        role.id,
        `Role deleted: ${role.title}`,
        {
          title: role.title,
          userType: role.userType,
          slug: role.slug,
          access: role.access,
        },
        null,
        tx,
      )
    })

    // Clear caches AFTER transaction succeeds; awaited, so a Redis failure surfaces instead
    // of becoming an unhandled rejection after the response.
    await cacheService.del(cacheKey(role.slug))
    await invalidateRoleUsers(role.id)
  }

  // Validate that all given permission values exist in ALL_PERMISSIONS
  _validateAccess(access: string[]): void {
    const invalid = access.filter((p) => !ALL_PERMISSIONS.includes(p))
    if (invalid.length > 0) {
      throw new AppError(
        `Invalid permission value(s): ${invalid.join(', ')}`,
        400,
      )
    }
  }
}

export default new RoleService()
