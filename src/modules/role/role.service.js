const AppError = require('../../utils/appError')
const roleRepository = require('./role.repository')
const cacheService = require('../../services/cache.service')
const { ALL_PERMISSIONS } = require('./role.permissions')
const { makeUniqueSlug } = require('../../utils/sluggable')
const systemService = require('../../services/system.service')
const prisma = require('../../config/database')

const cacheKey = (id) => `role:${id}`

// Service layer for Role management
class RoleService {
  async getRoles(req) {
    return await roleRepository.paginate(req)
  }

  async getRole(slug) {
    const role = await roleRepository.findBySlug(slug)
    if (!role) {
      throw new AppError('Role not found', 404)
    }

    return role
  }

  async createRole(data, createdBy = null) {
    this._validateAccess(data.access)

    // Use transaction to ensure role creation and activity logging are atomic
    const role = await prisma.$transaction(async (tx) => {
      const slug = await makeUniqueSlug(data.title, (candidate, excludeId) =>
        roleRepository.findBySlugExcluding(candidate, excludeId, tx),
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
        },
        tx,
      )

      return newRole
    })

    return role
  }

  async updateRole(slug, data, updatedBy = null) {
    const role = await roleRepository.findBySlug(slug)

    if (!role) {
      throw new AppError('Role not found', 404)
    }

    if (data.access) {
      this._validateAccess(data.access)
    }

    // Use transaction to ensure role update and activity logging are atomic
    const updated = await prisma.$transaction(async (tx) => {
      // onUpdate: regenerate slug whenever title changes
      let newSlug
      if (data.title && data.title !== role.title) {
        newSlug = await makeUniqueSlug(
          data.title,
          (candidate, excludeId) =>
            roleRepository.findBySlugExcluding(candidate, excludeId, tx),
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
          ...(data.access && { access: data.access }),
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
        { title: role.title, userType: role.userType, slug: role.slug },
        {
          title: updatedRole.title,
          userType: updatedRole.userType,
          slug: updatedRole.slug,
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

  async deleteRole(slug, deletedBy = null) {
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
    await prisma.$transaction(async (tx) => {
      await roleRepository.delete(role.id, tx)

      // Log activity within transaction
      await systemService.logActivity(
        deletedBy,
        'DELETE',
        'Role',
        role.id,
        `Role deleted: ${role.title}`,
        { title: role.title, userType: role.userType, slug: role.slug },
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
  _validateAccess(access) {
    const invalid = access.filter((p) => !ALL_PERMISSIONS.includes(p))
    if (invalid.length > 0) {
      throw new AppError(
        `Invalid permission value(s): ${invalid.join(', ')}`,
        400,
      )
    }
  }
}

module.exports = new RoleService()
