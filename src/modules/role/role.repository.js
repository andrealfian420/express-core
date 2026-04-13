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
          userType: true,
          description: true,
          access: true,
          createdAt: true,
          updatedAt: true,
        },
        searchFields: ['title', 'description'],
        allowedSorts: ['title', 'userType', 'createdAt'],
      },
      req,
    )
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

  async findBySlugExcluding(slug, excludeId = null) {
    return await prisma.role.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
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
