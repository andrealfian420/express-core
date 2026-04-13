const roleService = require('./role.service')
const { ACCESS_LIST } = require('./role.permissions')
const response = require('../../utils/response')

// Controller functions for Role management
class RoleController {
  async index(req, res, next) {
    try {
      const result = await roleService.getRoles(req)
      response(res, result, 'Roles retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async show(req, res, next) {
    try {
      const role = await roleService.getRole(req.params.slug)
      response(res, role, 'Role retrieved successfully')
    } catch (err) {
      next(err)
    }
  }

  async store(req, res, next) {
    try {
      const role = await roleService.createRole(req.body)
      response(res, role, 'Role created successfully', 201)
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      const role = await roleService.updateRole(req.params.slug, req.body)
      response(res, role, 'Role updated successfully')
    } catch (err) {
      next(err)
    }
  }

  async destroy(req, res, next) {
    try {
      await roleService.deleteRole(req.params.slug)
      response(res, null, 'Role deleted successfully')
    } catch (err) {
      next(err)
    }
  }

  // Returns the full permission tree for Frontend consumption
  accessList(req, res) {
    response(res, ACCESS_LIST, 'Access list retrieved successfully')
  }
}

module.exports = new RoleController()
