const helperService = require('./helper.service')
const response = require('../../utils/response')

class HelperController {
  async roleOptions(req, res, next) {
    try {
      const roles = await helperService.getRoleOptions()
      response(res, roles, 'Role options retrieved successfully')
    } catch (err) {
      next(err)
    }
  }
}

module.exports = new HelperController()
