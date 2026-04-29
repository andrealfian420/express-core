import { Role } from '@prisma/client'
import prisma from '../../config/database'

class HelperRepository {
  async getRoleOptions(): Promise<Role[]> {
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

export default new HelperRepository()
