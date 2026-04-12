const prisma = require('../../config/database')

class RoleRepository {
  async findAll() {
    return await prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        userType: true,
        description: true,
        access: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  async findById(id) {
    return await prisma.role.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async findBySlug(slug) {
    return await prisma.role.findFirst({
      where: { slug, deletedAt: null },
    })
  }

  async create(data) {
    return await prisma.role.create({ data })
  }

  async update(id, data) {
    return await prisma.role.update({
      where: { id },
      data,
    })
  }

  async delete(id) {
    return await prisma.role.delete({
      where: { id },
    })
  }

  async countUsers(roleId) {
    return await prisma.user.count({
      where: { roleId, deletedAt: null },
    })
  }
}

module.exports = new RoleRepository()
