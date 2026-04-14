const { z } = require('zod')

// Validation schema for getting activity log by ID
const getActivityLogSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a valid number'),
})

// Validation schema for getting user's activity logs
const getUserLogsSchema = z.object({
  userId: z.string().regex(/^\d+$/, 'User ID must be a valid number'),
})

module.exports = {
  getActivityLogSchema,
  getUserLogsSchema,
}
