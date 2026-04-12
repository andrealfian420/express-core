const prisma = require('../../config/database')

// UserRepository handles all database operations related to the User model
class UserRepository {
  async getUser() {
    return await prisma.user.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        isEmailVerified: true,
      },
    })
  }

  async find(slug) {
    return await prisma.user.findFirst({
      where: { slug, deletedAt: null },
    })
  }

  async findByEmail(email) {
    return await prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    })
  }

  async findBySlugExcluding(slug, excludeId = null) {
    return await prisma.user.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
  }

  async create(data) {
    return await prisma.user.create({
      data,
    })
  }

  async update(id, data) {
    return await prisma.user.update({
      where: { id },
      data,
    })
  }
}

module.exports = new UserRepository()
