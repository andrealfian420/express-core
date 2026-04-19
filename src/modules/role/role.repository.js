const prisma = require('../../config/database')
const { paginate } = require('../../utils/paginator')

class RoleRepository {
  async paginate(req) {
    return await paginate(
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

  async findById(id, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.role.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async findBySlug(slug, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.role.findFirst({
      where: { slug, deletedAt: null },
    })
  }

  async findBySlugExcluding(slug, excludeId = null, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.role.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
  }

  async create(data, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.role.create({ data })
  }

  async update(id, data, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.role.update({
      where: { id },
      data,
    })
  }

  async delete(id, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.role.delete({
      where: { id },
    })
  }

  async countUsers(roleId, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.user.count({
      where: { roleId, deletedAt: null },
    })
  }
}

module.exports = new RoleRepository()
