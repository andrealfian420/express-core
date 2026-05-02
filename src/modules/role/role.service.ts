import { Request } from 'express'
import prisma from '../../config/database'
import { Prisma, Role } from '@prisma/client'
import AppError from '../../utils/appError'
import roleRepository from './role.repository'
import cacheService from '../../services/cache.service'
import { ALL_PERMISSIONS } from './role.permissions'
import { makeUniqueSlug } from '../../utils/sluggable'
import systemService from '../../services/system.service'

const cacheKey = (id: string | number): string => `role:${id}`

// Service layer for Role management
class RoleService {
  async getRoles(req: Request): Promise<any> {
    return await roleRepository.getRoles(req)
  }

  async getRole(slug: string): Promise<Role | null> {
    const role = await roleRepository.findBySlug(slug)
    if (!role) {
      throw new AppError('Role not found', 404)
    }

    return role
  }

  async createRole(data: any, createdBy: number | null = null): Promise<Role> {
    this._validateAccess(data.access)

    // Use transaction to ensure role creation and activity logging are atomic
    const role = await prisma.$transaction(async (tx: any) => {
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
    const updated = await prisma.$transaction(async (tx: any) => {
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

    // delete all user caches that have this role assigned
    const userIds = await cacheService.smembers(`role-users:${role.id}`)
    for (const userId of userIds) {
      await cacheService.del(`user-role:${userId}`)
      await cacheService.del(`profile:${userId}`) // also invalidate profile cache since it contains role info
    }

    await cacheService.del(`role-users:${role.id}`)

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
    await prisma.$transaction(async (tx: any) => {
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

    // Clear caches AFTER transaction succeeds
    await cacheService.smembers(`role-users:${role.id}`).then((userIds) => {
      userIds.forEach(
        async (userId) => await cacheService.del(`user-role:${userId}`),
      )
    })
    await cacheService.del(`role-users:${role.id}`)
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
