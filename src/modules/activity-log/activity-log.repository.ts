import { Request } from 'express'
import prisma from '../../config/database'
import { paginate } from '../../utils/paginator'

// ActivityLogRepository handles all database operations related to the ActivityLog model
class ActivityLogRepository {
  async paginate(req: Request): Promise<any> {
    return await paginate(
      prisma.activityLog,
      {
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
        transform: (log: any) => ({
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

  async findById(id: number, txOrPrisma: any = null): Promise<any> {
    const db = txOrPrisma || prisma
    return await db.activityLog.findFirst({
      where: { id },
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

  async findByUserId(userId: number, req: Request): Promise<any> {
    return await paginate(
      prisma.activityLog,
      {
        where: { userId },
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
        transform: (log: any) => ({
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

export default new ActivityLogRepository()
