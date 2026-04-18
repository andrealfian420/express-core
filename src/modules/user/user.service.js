const AppError = require('../../utils/appError')
const userRepository = require('./user.repository')
const bcrypt = require('bcryptjs')
const cacheService = require('../../services/cache.service')
const { makeUniqueSlug } = require('../../utils/sluggable')
const systemService = require('../../services/system.service')
const prisma = require('../../config/database')
const storageService = require('../../services/storage.service')

// UserService contains business logic related to users.
class UserService {
  async getUsers(req) {
    return await userRepository.paginate(req)
  }

  async getUserBySlug(slug) {
    const user = await userRepository.find(slug)

    if (!user) {
      throw new AppError('User not found', 404)
    }

    if (user.avatar) {
      user.avatarUrl = storageService.getPublicUrl(
        '/uploads/avatars',
        user.avatar,
      )
    }

    return user
  }

  async getUserByEmail(email) {
    const user = await userRepository.findByEmail(email)

    if (!user) {
      throw new AppError('User not found', 404)
    }

    return user
  }

  async createUser(data, createdBy = null) {
    // Use transaction to ensure user creation and activity logging are atomic
    const user = await prisma.$transaction(async (tx) => {
      const existingUser = await userRepository.findByEmail(data.email, tx)
      if (existingUser) {
        throw new AppError('Email already in use', 400)
      }

      const slug = await makeUniqueSlug(data.name, (candidate, excludeId) =>
        userRepository.findBySlugExcluding(candidate, excludeId, tx),
      )

      const hashedPassword = await bcrypt.hash(
        data.password,
        parseInt(process.env.BCRYPT_ROUNDS),
      )

      const newUser = await userRepository.create(
        {
          ...data,
          slug,
          password: hashedPassword,
          roleId: parseInt(data.roleId),
        },
        tx,
      )

      // Log activity within transaction
      await systemService.logActivity(
        createdBy,
        'CREATE',
        'User',
        newUser.id,
        `User created: ${newUser.name}`,
        null,
        {
          email: newUser.email,
          name: newUser.name,
          slug: newUser.slug,
          roleId: newUser.roleId,
        },
        tx,
      )

      return newUser
    })

    return user
  }

  async updateUser(slug, data, updatedBy = null) {
    const user = await userRepository.find(slug)
    if (!user) {
      throw new AppError('User not found', 404)
    }

    if (data.email && data.email !== user.email) {
      const existing = await userRepository.findByEmail(data.email)

      if (existing) {
        throw new AppError('Email already in use', 400)
      }
    }

    // Use transaction to ensure user update and activity logging are atomic
    const updated = await prisma.$transaction(async (tx) => {
      // onUpdate: regenerate slug whenever name changes
      let newSlug
      if (data.name && data.name !== user.name) {
        newSlug = await makeUniqueSlug(
          data.name,
          (candidate, excludeId) =>
            userRepository.findBySlugExcluding(candidate, excludeId, tx),
          user.id,
        )
      }

      // Handle avatar: delete old file if a new one is uploaded
      if (data.avatar && user.avatar) {
        storageService.deleteFile('avatars', user.avatar)
      }

      // Hash new password if provided
      if (data.password) {
        data.password = await bcrypt.hash(
          data.password,
          parseInt(process.env.BCRYPT_ROUNDS),
        )
      }

      const updatedUser = await userRepository.update(
        user.id,
        {
          ...(data.name && { name: data.name }),
          ...(newSlug && { slug: newSlug }),
          ...(data.email && { email: data.email }),
          ...(data.roleId && { roleId: parseInt(data.roleId) }),
          ...(data.avatar && { avatar: data.avatar }),
          ...(data.password && { password: data.password }),
        },
        tx,
      )

      // Log activity within transaction
      await systemService.logActivity(
        updatedBy,
        'UPDATE',
        'User',
        user.id,
        `User updated: ${updatedUser.name}`,
        {
          name: user.name,
          email: user.email,
          slug: user.slug,
          roleId: user.roleId,
        },
        {
          name: updatedUser.name,
          email: updatedUser.email,
          slug: updatedUser.slug,
          roleId: updatedUser.roleId,
        },
        tx,
      )

      return updatedUser
    })

    // If slug changed, the new one will be populated on next request
    // Invalidate RBAC cache so role changes take effect immediately
    await cacheService.del(`user-role:${user.id}`)

    return updated
  }

  async deleteUser(slug, deletedBy = null) {
    const user = await userRepository.find(slug)
    if (!user) {
      throw new AppError('User not found', 404)
    }

    if (user.avatar) {
      storageService.deleteFile('avatars', user.avatar)
    }

    // Use transaction to ensure user deletion and activity logging are atomic
    await prisma.$transaction(async (tx) => {
      await userRepository.delete(user.id, tx)

      // Log activity within transaction
      await systemService.logActivity(
        deletedBy,
        'DELETE',
        'User',
        user.id,
        `User deleted: ${user.name}`,
        {
          name: user.name,
          email: user.email,
          slug: user.slug,
          roleId: user.roleId,
        },
        null,
        tx,
      )
    })

    // Invalidate RBAC cache so role changes take effect immediately
    await cacheService.del(`user-role:${user.id}`)
  }
}

module.exports = new UserService()
