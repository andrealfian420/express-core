const prisma = require('../../config/database')
const { paginate } = require('../../utils/paginator')

// UserRepository handles all database operations related to the User model
class UserRepository {
  async paginate(req) {
    return await paginate(
      prisma.user,
      {
        where: { deletedAt: null },
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
        allowedSorts: ['name', 'email', 'createdAt'],

        // optional transform function to modify each data item before returning
        transform: (user) => ({
          ...user,
          roleName: user.role ? user.role.title : null,
        }),
      },
      req,
    )
  }

  async find(slug, txOrPrisma = null) {
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

  async findByEmail(email, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    })
  }

  async findBySlugExcluding(slug, excludeId = null, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.user.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
  }

  async create(data, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.user.create({
      data,
    })
  }

  async update(id, data, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.user.update({
      where: { id },
      data,
    })
  }
}

module.exports = new UserRepository()
