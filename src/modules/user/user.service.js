const AppError = require('../../utils/appError')
const userRepository = require('./user.repository')
const bcrypt = require('bcryptjs')
const cacheService = require('../../services/cache.service')
const { makeUniqueSlug } = require('../../utils/sluggable')
const systemService = require('../../services/system.service')

const USER_CACHE_TTL = 300 // 5 minutes
const slugCacheKey = (slug) => `user:slug:${slug}`

// UserService contains business logic related to users.
class UserService {
  async getUsers(req) {
    return await userRepository.paginate(req)
  }

  async getUserBySlug(slug) {
    const cacheKey = slugCacheKey(slug)
    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const user = await userRepository.find(slug)
    if (!user) throw new AppError('User not found', 404)

    await cacheService.set(cacheKey, user, USER_CACHE_TTL)
    return user
  }

  async getUserByEmail(email) {
    const cacheKey = `user:email:${email}`
    const cachedUser = await cacheService.get(cacheKey)

    if (cachedUser) {
      return cachedUser
    }

    const user = await userRepository.findByEmail(email)
    await cacheService.set(cacheKey, user, USER_CACHE_TTL)

    return user
  }

  async createUser(data, createdBy = null) {
    const existingUser = await userRepository.findByEmail(data.email)
    if (existingUser) {
      throw new AppError('Email already in use', 400)
    }

    const slug = await makeUniqueSlug(data.name, (candidate, excludeId) =>
      userRepository.findBySlugExcluding(candidate, excludeId),
    )

    data.password = await bcrypt.hash(data.password, 12)

    const user = await userRepository.create({ ...data, slug })

    // Log activity
    await systemService.logActivity(
      createdBy,
      'CREATE',
      'User',
      user.id,
      `User created: ${user.name}`,
      null,
      { email: user.email, name: user.name, slug: user.slug },
    )

    return user
  }

  async updateUser(slug, data, updatedBy = null) {
    const user = await userRepository.find(slug)
    if (!user) throw new AppError('User not found', 404)

    if (data.email && data.email !== user.email) {
      const existing = await userRepository.findByEmail(data.email)
      if (existing) throw new AppError('Email already in use', 400)
    }

    // onUpdate: regenerate slug whenever name changes
    let newSlug
    if (data.name && data.name !== user.name) {
      newSlug = await makeUniqueSlug(
        data.name,
        (candidate, excludeId) =>
          userRepository.findBySlugExcluding(candidate, excludeId),
        user.id,
      )
    }

    const updated = await userRepository.update(user.id, {
      ...(data.name && { name: data.name }),
      ...(newSlug && { slug: newSlug }),
      ...(data.email && { email: data.email }),
      ...(data.roleId !== undefined && { roleId: data.roleId }),
    })

    // Invalidate old slug cache
    await cacheService.del(slugCacheKey(slug))
    // If slug changed, the new one will be populated on next request
    // Invalidate RBAC cache so role changes take effect immediately
    await cacheService.del(`user-role:${user.id}`)

    // Log activity
    await systemService.logActivity(
      updatedBy,
      'UPDATE',
      'User',
      user.id,
      `User updated: ${updated.name}`,
      {
        name: user.name,
        email: user.email,
        slug: user.slug,
        roleId: user.roleId,
      },
      {
        name: updated.name,
        email: updated.email,
        slug: updated.slug,
        roleId: updated.roleId,
      },
    )

    return updated
  }
}

module.exports = new UserService()
