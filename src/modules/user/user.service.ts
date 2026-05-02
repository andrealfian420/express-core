import { Request } from 'express'
import AppError from '../../utils/appError'
import userRepository from './user.repository'
import bcrypt from 'bcryptjs'
import cacheService from '../../services/cache.service'
import { makeUniqueSlug } from '../../utils/sluggable'
import systemService from '../../services/system.service'
import prisma from '../../config/database'
import storageService from '../../services/storage.service'
import { Prisma, User } from '@prisma/client'
import { UserProfileData } from '../user/user.types'
import { PrismaTx } from '../../types/prisma'

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10')

// UserService contains business logic related to users.
class UserService {
  async getUsers(req: Request): Promise<any> {
    return await userRepository.getUsers(req)
  }

  async getUserBySlug(slug: string): Promise<UserProfileData> {
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

  async getUserByEmail(email: string): Promise<User> {
    const user = await userRepository.findByEmail(email)

    if (!user) {
      throw new AppError('User not found', 404)
    }

    return user
  }

  async createUser(
    data: Prisma.UserUncheckedCreateInput,
    createdBy: number | null = null,
  ): Promise<User> {
    // Use transaction to ensure user creation and activity logging are atomic
    const user = await prisma.$transaction(async (tx: PrismaTx) => {
      const existingUser = await userRepository.findByEmail(
        data.email as string,
        tx,
      )
      if (existingUser) {
        throw new AppError('Email already in use', 400)
      }

      const slug = await makeUniqueSlug(
        data.name as string,
        (candidate, excludeId) =>
          userRepository.findBySlugExcluding(candidate, excludeId, tx),
      )

      const hashedPassword = await bcrypt.hash(
        data.password as string,
        BCRYPT_ROUNDS,
      )

      const newUser = await userRepository.create(
        {
          ...data,
          isEmailVerified: true,
          slug,
          password: hashedPassword,
          roleId: Number(data.roleId),
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
          avatar: newUser.avatar,
        },
        tx,
      )

      return newUser
    })

    return user
  }

  async updateUser(
    slug: string,
    data: Prisma.UserUncheckedUpdateInput,
    updatedBy: number | null = null,
  ): Promise<User> {
    const user = await userRepository.find(slug)
    if (!user) {
      throw new AppError('User not found', 404)
    }

    if (data.email && data.email !== user.email) {
      const existing = await userRepository.findByEmail(data.email as string)

      if (existing) {
        throw new AppError('Email already in use', 400)
      }
    }

    // Use transaction to ensure user update and activity logging are atomic
    const updated = await prisma.$transaction(async (tx: PrismaTx) => {
      // onUpdate: regenerate slug whenever name changes
      let newSlug
      if (data.name && data.name !== user.name) {
        newSlug = await makeUniqueSlug(
          data.name as string,
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
          data.password as string,
          BCRYPT_ROUNDS,
        )
      }

      const updatedUser = await userRepository.update(
        user.id,
        {
          ...(data.name && { name: data.name }),
          ...(newSlug && { slug: newSlug }),
          ...(data.email && { email: data.email }),
          ...(data.roleId && { roleId: Number(data.roleId) }),
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
          avatar: user.avatar,
        },
        {
          name: updatedUser.name,
          email: updatedUser.email,
          slug: updatedUser.slug,
          roleId: updatedUser.roleId,
          avatar: updatedUser.avatar,
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

  async deleteUser(
    slug: string,
    deletedBy: number | null = null,
  ): Promise<void> {
    const user = await userRepository.find(slug)
    if (!user) {
      throw new AppError('User not found', 404)
    }

    if (user.avatar) {
      storageService.deleteFile('avatars', user.avatar)
    }

    // Use transaction to ensure user deletion and activity logging are atomic
    await prisma.$transaction(async (tx: PrismaTx) => {
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

    await cacheService.del(`user-role:${user.id}`)
  }
}

export default new UserService()
