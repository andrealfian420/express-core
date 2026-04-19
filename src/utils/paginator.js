/**
 * Paginate a Prisma model query, Laravel-style.
 *
 * @param {object}   model                  - Prisma delegate  (e.g. prisma.user)
 * @param {object}   options
 * @param {object}   options.where          - Base Prisma where clause (always applied)
 * @param {object}   [options.whereNot]     - Prisma NOT clause to exclude records
 * @param {object}   [options.select]       - Prisma select clause
 * @param {object}   [options.include]      - Prisma include clause
 * @param {string[]} [options.searchFields] - Model fields to search with ILIKE
 * @param {string[]} [options.allowedSorts]  - Whitelisted sort-by field names
 * @param {Function} [options.transform]     - Optional map function applied to each item before returning (like ->through())
 * @param {object}   req                     - Express request object
 * @returns {Promise<{data, meta, links}>}
 */
const paginate = async (model, options = {}, req) => {
  const {
    where: baseWhere = {},
    whereNot,
    select,
    include,
    searchFields = [],
    allowedSorts = ['createdAt'],
    transform = null,
  } = options

  const query = req.query

  const page = Math.max(1, parseInt(query.page) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(query.per_page) || 15))
  const search = query.search?.trim() || null
  const sortBy = allowedSorts.includes(query.sort_by)
    ? query.sort_by
    : 'createdAt' // Default sort field
  const sortDir = query.sort_dir === 'asc' ? 'asc' : 'desc'

  // Merge whereNot into the base where clause
  const baseWhereWithNot = whereNot
    ? { ...baseWhere, NOT: whereNot }
    : baseWhere

  // Merge full-text search into the base where clause
  const finalWhere =
    search && searchFields.length > 0
      ? {
          AND: [
            baseWhereWithNot,
            {
              OR: searchFields.map((field) => ({
                [field]: { contains: search, mode: 'insensitive' },
              })),
            },
          ],
        }
      : baseWhereWithNot

  const skip = (page - 1) * perPage

  const [data, total] = await Promise.all([
    model.findMany({
      where: finalWhere,
      ...(select ? { select } : {}),
      ...(include ? { include } : {}),
      orderBy: { [sortBy]: sortDir },
      skip,
      take: perPage,
    }),
    model.count({ where: finalWhere }),
  ])

  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const from = total === 0 ? null : skip + 1
  const to = total === 0 ? null : Math.min(skip + perPage, total)

  const basePath = `${req.protocol}://${req.get('host')}${req.path}`

  const buildUrl = (p) => {
    const params = new URLSearchParams()
    params.set('page', p)
    if (perPage !== 15) {
      params.set('per_page', perPage)
    }
    if (search) {
      params.set('search', search)
    }
    if (query.sort_by) {
      params.set('sort_by', query.sort_by)
    }
    if (query.sort_dir) {
      params.set('sort_dir', query.sort_dir)
    }
    return `${basePath}?${params.toString()}`
  }

  const links = [
    {
      url: page > 1 ? buildUrl(page - 1) : null,
      label: '&laquo; Previous',
      active: false,
    },
    ...Array.from({ length: lastPage }, (_, i) => ({
      url: buildUrl(i + 1),
      label: String(i + 1),
      active: i + 1 === page,
    })),
    {
      url: page < lastPage ? buildUrl(page + 1) : null,
      label: 'Next &raquo;',
      active: false,
    },
  ]

  return {
    data: transform ? data.map(transform) : data,
    meta: {
      total,
      per_page: perPage,
      current_page: page,
      last_page: lastPage,
      from,
      to,
      path: basePath,
      first_page_url: buildUrl(1),
      last_page_url: buildUrl(lastPage),
      next_page_url: page < lastPage ? buildUrl(page + 1) : null,
      prev_page_url: page > 1 ? buildUrl(page - 1) : null,
    },
    links,
  }
}

module.exports = { paginate }
