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
          oldData: true,
          newData: true,
          subjectId: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        searchFields: ['action', 'description', 'subjectType'],
        allowedSorts: ['createdAt', 'action'],

        // optional transform function to modify each data item before returning
        transform: (log) => ({
          actionType: log.action,
          causedAt: log.createdAt.toLocaleString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }), // format as j F Y H:i
          ...log,
        }),
      },
      req,
    )
  }

  async findById(id, txOrPrisma = null) {
    const db = txOrPrisma || prisma
    return await db.activityLog.findFirst({
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
        user: {
          select: {
            id: true,
            name: true,
          },
        },
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
          oldData: true,
          newData: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        searchFields: ['action', 'description', 'subjectType'],
        allowedSorts: ['action', 'createdAt'],
        transform: (log) => ({
          actionType: log.action,
          causedAt: log.createdAt.toLocaleString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }), // format as j F Y H:i
          ...log,
        }),
      },
      req,
    )
  }
}

module.exports = new ActivityLogRepository()
