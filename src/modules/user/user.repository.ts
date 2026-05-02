import { Request } from 'express'
import prisma from '../../config/database'
import { Prisma, User } from '@prisma/client'
import { paginate, PaginatedResult } from '../../utils/paginator'
import { UserListData, UserProfileData } from '../user/user.types'
import { PrismaTx } from '../../types/prisma'

// UserRepository handles all database operations related to the User model
class UserRepository {
  async getUsers(req: Request): Promise<PaginatedResult<UserListData>> {
    return await paginate<UserListData>(
      prisma.user,
      {
        where: { deletedAt: null },
        whereNot: { id: req.user?.sub },
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          isEmailVerified: true,
          createdAt: true,
          role: {
            select: {
              id: true,
              title: true,
              slug: true,
              userType: true,
            },
          },
        },
        searchFields: ['name', 'email'],
        allowedSorts: ['createdAt', 'name', 'email'],

        // optional transform function to modify each data item before returning
        transform: (user: UserListData) => ({
          ...user,
          roleName: user.role ? user.role.title : '-',
          registeredAt: user.createdAt.toLocaleString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }), // format as j F Y H:i
        }),
      },
      req,
    )
  }

  async find(
    slug: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<UserProfileData | null> {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        isEmailVerified: true,
        avatar: true,
        roleId: true,
      },
    })
  }

  async findByEmail(
    email: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User | null> {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    })
  }

  async findBySlugExcluding(
    slug: string,
    excludeId: string | number | null = null,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User | null> {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
  }

  async create(
    data: Prisma.UserUncheckedCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User> {
    const db = txOrPrisma || prisma
    return await db.user.create({
      data,
    })
  }

  async update(
    id: number,
    data: Prisma.UserUpdateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<User> {
    const db = txOrPrisma || prisma
    return await db.user.update({
      where: { id },
      data,
    })
  }

  async delete(id: number, txOrPrisma: PrismaTx | null = null): Promise<void> {
    const db = txOrPrisma || prisma
    await db.user.delete({
      where: { id },
    })
  }
}

export default new UserRepository()
