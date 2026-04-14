const AppError = require('../../utils/appError')
const roleRepository = require('./role.repository')
const cacheService = require('../../services/cache.service')
const { ALL_PERMISSIONS } = require('./role.permissions')
const { makeUniqueSlug } = require('../../utils/sluggable')
const systemService = require('../../services/system.service')

const CACHE_TTL = 300 // 5 minutes
const cacheKey = (id) => `role:${id}`

// Service layer for Role management
class RoleService {
  async getRoles(req) {
    return await roleRepository.paginate(req)
  }

  async getRole(slug) {
    const cached = await cacheService.get(cacheKey(slug))
    if (cached) {
      return cached
    }

    const role = await roleRepository.findBySlug(slug)
    if (!role) {
      throw new AppError('Role not found', 404)
    }

    await cacheService.set(cacheKey(slug), role, CACHE_TTL)
    return role
  }

  async createRole(data, createdBy = null) {
    this._validateAccess(data.access)

    const slug = await makeUniqueSlug(data.title, (candidate, excludeId) =>
      roleRepository.findBySlugExcluding(candidate, excludeId),
    )

    const role = await roleRepository.create({
      slug,
      title: data.title,
      userType: data.userType,
      description: data.description ?? null,
      access: data.access,
    })

    // Log activity
    await systemService.logActivity(
      createdBy,
      'CREATE',
      'Role',
      role.id,
      `Role created: ${role.title}`,
      null,
      { title: role.title, userType: role.userType, slug: role.slug },
    )

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

    // onUpdate: regenerate slug whenever title changes
    let newSlug
    if (data.title && data.title !== role.title) {
      newSlug = await makeUniqueSlug(
        data.title,
        (candidate, excludeId) =>
          roleRepository.findBySlugExcluding(candidate, excludeId),
        role.id,
      )
    }

    const updated = await roleRepository.update(role.id, {
      ...(data.title && { title: data.title }),
      ...(newSlug && { slug: newSlug }),
      ...(data.userType && { userType: data.userType }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.access && { access: data.access }),
    })

    await cacheService.del(cacheKey(role.slug))

    // delete all user caches that have this role assigned
    const userIds = await cacheService.smembers(`role-users:${role.id}`)
    for (const userId of userIds) {
      await cacheService.del(`user-role:${userId}`)
    }

    await cacheService.del(`role-users:${role.id}`)

    // Log activity
    await systemService.logActivity(
      updatedBy,
      'UPDATE',
      'Role',
      role.id,
      `Role updated: ${updated.title}`,
      { title: role.title, userType: role.userType, slug: role.slug },
      { title: updated.title, userType: updated.userType, slug: updated.slug },
    )

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

    await roleRepository.delete(role.id)
    await cacheService.del(cacheKey(role.slug))
    await cacheService.smembers(`role-users:${role.id}`).then((userIds) => {
      userIds.forEach(
        async (userId) => await cacheService.del(`user-role:${userId}`),
      )
    })
    await cacheService.del(`role-users:${role.id}`)

    // Log activity
    await systemService.logActivity(
      deletedBy,
      'DELETE',
      'Role',
      role.id,
      `Role deleted: ${role.title}`,
      { title: role.title, userType: role.userType, slug: role.slug },
      null,
    )
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
