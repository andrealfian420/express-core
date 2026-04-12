const { z } = require('zod')

const createRoleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  userType: z.string().min(1, 'User type is required'),
  description: z.string().optional(),
  access: z.array(z.string().min(1)).default([]),
})

const updateRoleSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  userType: z.string().min(1, 'User type is required').optional(),
  description: z.string().nullable().optional(),
  access: z.array(z.string().min(1)).optional(),
})

module.exports = { createRoleSchema, updateRoleSchema }
