import { Request } from 'express'
import { Prisma, Role } from '@prisma/client'
import prisma from '../../config/database'
import { paginate, PaginatedResult } from '../../utils/paginator'
import { PrismaTx } from '../../types/prisma'

class RoleRepository {
  async getRoles(req: Request): Promise<PaginatedResult<Role>> {
    return await paginate<Role>(
      prisma.role,
      {
        where: { deletedAt: null },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          userType: true,
          createdAt: true,
          updatedAt: true,
        },
        searchFields: ['title', 'description'],
        allowedSorts: ['title', 'userType', 'createdAt'],
      },
      req,
    )
  }

  async findById(
    id: number,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Role | null> {
    const db = txOrPrisma || prisma
    return await db.role.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async findBySlug(
    slug: string,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Role | null> {
    const db = txOrPrisma || prisma
    return await db.role.findFirst({
      where: { slug, deletedAt: null },
    })
  }

  async findBySlugExcluding(
    slug: string,
    excludeId: number | null = null,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Role | null> {
    const db = txOrPrisma || prisma
    return await db.role.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
  }

  async create(
    data: Prisma.RoleCreateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Role> {
    const db = txOrPrisma || prisma
    return await db.role.create({ data })
  }

  async update(
    id: number,
    data: Prisma.RoleUpdateInput,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<Role> {
    const db = txOrPrisma || prisma
    return await db.role.update({
      where: { id },
      data,
    })
  }

  async delete(id: number, txOrPrisma: PrismaTx | null = null): Promise<Role> {
    const db = txOrPrisma || prisma
    return await db.role.delete({
      where: { id },
    })
  }

  async countUsers(
    roleId: number,
    txOrPrisma: PrismaTx | null = null,
  ): Promise<number> {
    const db = txOrPrisma || prisma
    return await db.user.count({
      where: { roleId, deletedAt: null },
    })
  }
}

export default new RoleRepository()
