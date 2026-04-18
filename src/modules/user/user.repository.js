const prisma = require('../../config/database')
const { paginate } = require('../../utils/paginator')

// UserRepository handles all database operations related to the User model
class UserRepository {
  async paginate(req) {
    return await paginate(
      prisma.user,
      {
        where: { deletedAt: null },
        whereNot: { id: req.user.sub },
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
        transform: (user) => ({
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

  async delete(id, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    await db.user.delete({
      where: { id },
    })
  }
}

module.exports = new UserRepository()
