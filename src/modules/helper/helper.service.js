const helperRepository = require('./helper.repository')

class HelperService {
  async getRoleOptions() {
    const roles = await helperRepository.getRoleOptions()

    return roles.map((role) => ({
      label: role.title,
      value: role.id,
    }))
  }
}

module.exports = new HelperService()
