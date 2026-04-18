const prisma = require('../../config/database')

class HelperRepository {
  async getRoleOptions() {
    return await prisma.role.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
      },
      orderBy: { title: 'asc' },
    })
  }
}

module.exports = new HelperRepository()
