const roleService = require('./role.service')
const { ACCESS_LIST } = require('./role.permissions')

// Controller functions for Role management
class RoleController {
  async index(req, res, next) {
    try {
      const roles = await roleService.getRoles()
      res.status(200).json({ success: true, data: roles })
    } catch (err) {
      next(err)
    }
  }

  async show(req, res, next) {
    try {
      const role = await roleService.getRoleById(Number(req.params.id))
      res.status(200).json({ success: true, data: role })
    } catch (err) {
      next(err)
    }
  }

  async store(req, res, next) {
    try {
      const role = await roleService.createRole(req.body)
      res.status(201).json({ success: true, data: role })
    } catch (err) {
      next(err)
    }
  }

  async update(req, res, next) {
    try {
      const role = await roleService.updateRole(Number(req.params.id), req.body)
      res.status(200).json({
        success: true,
        message: 'Role updated successfully',
        data: role,
      })
    } catch (err) {
      next(err)
    }
  }

  async destroy(req, res, next) {
    try {
      await roleService.deleteRole(Number(req.params.id))
      res
        .status(200)
        .json({ success: true, message: 'Role deleted successfully' })
    } catch (err) {
      next(err)
    }
  }

  // Returns the full permission tree for Frontend consumption
  accessList(req, res) {
    res.status(200).json({ success: true, data: ACCESS_LIST })
  }
}

module.exports = new RoleController()
