const prisma = require('../../config/database')
const { paginate } = require('../../utils/paginator')

// ActivityLogRepository handles all database operations related to the ActivityLog model
class ActivityLogRepository {
  async paginate(req) {
    return await paginate(
      prisma.activityLog,
      {
        where: { deletedAt: null },
        select: {
          id: true,
          userId: true,
          action: true,
          description: true,
          subjectType: true,
          subjectId: true,
          createdAt: true,
        },
        searchFields: ['action', 'description', 'subjectType'],
        allowedSorts: ['action', 'createdAt'],

        // optional transform function to modify each data item before returning
        transform: (log) => ({
          ...log,
        }),
      },
      req,
    )
  }

  async findById(id) {
    return await prisma.activityLog.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        userId: true,
        action: true,
        description: true,
        subjectType: true,
        subjectId: true,
        oldData: true,
        newData: true,
        createdAt: true,
      },
    })
  }

  async findByUserId(userId, req) {
    return await paginate(
      prisma.activityLog,
      {
        where: { userId, deletedAt: null },
        select: {
          id: true,
          userId: true,
          action: true,
          description: true,
          subjectType: true,
          subjectId: true,
          createdAt: true,
        },
        searchFields: ['action', 'description', 'subjectType'],
        allowedSorts: ['action', 'createdAt'],
      },
      req,
    )
  }
}

module.exports = new ActivityLogRepository()
