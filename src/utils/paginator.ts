import { Request } from 'express'

// Interface representing a generic Prisma model delegate
export interface PrismaDelegate {
  findMany(args: any): Promise<any[]>
  count(args: any): Promise<number>
}

// Interface for pagination options.
// 'T' represents the type of the original model.
// 'R' represents the type after transformation (if a transform function is provided).
export interface PaginateOptions<T, R = T> {
  where?: any
  whereNot?: any
  select?: any
  include?: any
  searchFields?: string[]
  allowedSorts?: string[]
  transform?: (item: T) => R
}

// Interface defining the structure of the final paginated response
export interface PaginatedResult<T> {
  data: T[]
  meta: {
    total: number
    per_page: number
    current_page: number
    last_page: number
    from: number | null
    to: number | null
    path: string
    first_page_url: string
    last_page_url: string
    next_page_url: string | null
    prev_page_url: string | null
  }
  links: Array<{
    url: string | null
    label: string
    active: boolean
  }>
}

/**
 * Paginate a Prisma model query, Laravel-style.
 *
 * @param model   - Prisma delegate (e.g., prisma.user)
 * @param options - Pagination configurations including where clauses, sorting, and transformations
 * @param req     - Express request object used to extract pagination query parameters
 * @returns A promise resolving to the structured paginated result (data, meta, and links)
 */
const paginate = async <T = any, R = T>(
  model: PrismaDelegate,
  options: PaginateOptions<T, R> = {},
  req: Request,
): Promise<PaginatedResult<R>> => {
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

  const pageParam = typeof query.page === 'string' ? query.page : '1'
  const perPageParam =
    typeof query.per_page === 'string' ? query.per_page : '15'
  const searchParam =
    typeof query.search === 'string' ? query.search.trim() : null
  const sortByParam = typeof query.sort_by === 'string' ? query.sort_by : ''
  const sortDirParam = typeof query.sort_dir === 'string' ? query.sort_dir : ''

  const page = Math.max(1, parseInt(pageParam) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(perPageParam) || 15))
  const search = searchParam || null
  const sortBy = allowedSorts.includes(sortByParam) ? sortByParam : 'createdAt'
  const sortDir = sortDirParam === 'asc' ? 'asc' : 'desc'

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

  const buildUrl = (p: number) => {
    const params = new URLSearchParams()
    params.set('page', String(p))
    if (perPage !== 15) {
      params.set('per_page', String(perPage))
    }
    if (search) {
      params.set('search', search)
    }
    if (sortByParam) {
      params.set('sort_by', sortByParam)
    }
    if (sortDirParam) {
      params.set('sort_dir', sortDirParam)
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

  const finalData = transform ? data.map(transform) : data

  return {
    // Safe cast since transform logic enforces the R type
    data: finalData as unknown as R[],
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

export { paginate }
