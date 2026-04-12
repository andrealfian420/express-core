const AppError = require('../../utils/appError')
const roleRepository = require('./role.repository')
const cacheService = require('../../services/cache.service')
const { ALL_PERMISSIONS } = require('./role.permissions')

const CACHE_TTL = 300 // 5 minutes
const cacheKey = (id) => `role:${id}`

// Service layer for Role management
class RoleService {
  async getRoles() {
    return await roleRepository.findAll()
  }

  async getRoleById(id) {
    const cached = await cacheService.get(cacheKey(id))
    if (cached) {
      return cached
    }

    const role = await roleRepository.findById(id)
    if (!role) {
      throw new AppError('Role not found', 404)
    }

    await cacheService.set(cacheKey(id), role, CACHE_TTL)
    return role
  }

  async createRole(data) {
    this._validateAccess(data.access)

    return await roleRepository.create({
      slug: data.slug,
      title: data.title,
      userType: data.userType,
      description: data.description ?? null,
      access: data.access,
    })
  }

  async updateRole(id, data) {
    const role = await roleRepository.findById(id)

    if (!role) {
      throw new AppError('Role not found', 404)
    }

    if (data.access) {
      this._validateAccess(data.access)
    }

    const updated = await roleRepository.update(id, {
      ...(data.slug && { slug: data.slug }),
      ...(data.title && { title: data.title }),
      ...(data.userType && { userType: data.userType }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.access && { access: data.access }),
    })

    await cacheService.del(cacheKey(id))

    // delete all user caches that have this role assigned
    const userIds = await cacheService.smembers(`role-users:${id}`)
    for (const userId of userIds) {
      await cacheService.del(`user-role:${userId}`)
    }

    await cacheService.del(`role-users:${id}`)

    return updated
  }

  async deleteRole(id) {
    const role = await roleRepository.findById(id)
    if (!role) {
      throw new AppError('Role not found', 404)
    }

    const userCount = await roleRepository.countUsers(id)

    if (userCount > 0) {
      throw new AppError(
        `Cannot delete role: ${userCount} user(s) are still assigned to this role`,
        409,
      )
    }

    await roleRepository.delete(id)
    await cacheService.del(cacheKey(id))
    await cacheService.smembers(`role-users:${id}`).then((userIds) => {
      userIds.forEach(
        async (userId) => await cacheService.del(`user-role:${userId}`),
      )
    })
    await cacheService.del(`role-users:${id}`)
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
