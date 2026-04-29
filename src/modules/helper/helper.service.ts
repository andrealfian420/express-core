import helperRepository from './helper.repository'

interface RoleOption {
  label: string
  value: number
}

class HelperService {
  async getRoleOptions(): Promise<RoleOption[]> {
    const roles = await helperRepository.getRoleOptions()

    return roles.map((role) => ({
      label: role.title,
      value: role.id,
    }))
  }
}

export default new HelperService()
