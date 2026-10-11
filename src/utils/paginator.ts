// Purpose: Generic Laravel-style pagination for Prisma models: page/per_page clamping, scalar
//   and relational search, whitelisted sorting with a configurable default, a unique tie-breaker
//   for stable pages, and the meta/links response block.
// Caller: Repositories (user, role, activity-log); module repositories added later.
// Dependencies: Express Request (query string), Prisma DMMF (relation metadata for dot-notation
//   search fields).
// Main Functions: paginate, PaginateOptions, PaginatedResult, PrismaDelegate.
// Side Effects: Database reads through the given delegate (findMany and count with the same
//   filter). Relation metadata is cached per model in memory.
// Notes: Only fields named by the caller are searched or sorted, never request-supplied names.
//   Every ORDER BY ends with the tie-breaker (default `id`), so OFFSET pages neither repeat nor
//   skip rows when the sort column has duplicates. Relational search adds a join or EXISTS per
//   relation and, like scalar `contains`, cannot use a b-tree index; keep the list short.
import { Request } from 'express'
import { Prisma } from '@prisma/client'

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
  // Prisma model name of `model` (e.g. 'User'); required when searchFields use dot notation.
  modelName?: string
  // Scalar fields ('name') or relation paths ('role.title', 'users.email'); to-many relations
  // match when any related row matches.
  searchFields?: string[]
  allowedSorts?: string[]
  // Ordering when sort_by is absent or not whitelisted; sort_dir still overrides the direction.
  defaultSort?: string
  defaultSortDir?: 'asc' | 'desc'
  // Unique column appended to the ordering; null only for models without one.
  tieBreaker?: string | null
  transform?: (item: T) => R
}

type FieldMeta = { kind: string; isList: boolean; type: string }

const modelFieldCache = new Map<string, Map<string, FieldMeta>>()

function modelFields(modelName: string): Map<string, FieldMeta> {
  let fields = modelFieldCache.get(modelName)
  if (!fields) {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName)
    if (!model) {
      throw new Error(`[paginator] Unknown Prisma model "${modelName}"`)
    }
    fields = new Map(
      model.fields.map((f) => [f.name, { kind: f.kind, isList: f.isList, type: f.type }]),
    )
    modelFieldCache.set(modelName, fields)
  }
  return fields
}

// 'role.title' on User → { role: { title: { contains } } }; to-many hops use `some`
// ('users.email' on Role → { users: { some: { email: { contains } } } }). Every hop must be a
// relation and the leaf a String column, so a typo fails loudly instead of matching nothing.
function relationalCondition(
  modelName: string,
  path: string,
  search: string,
): Record<string, unknown> {
  const segments = path.split('.')
  const leaf = segments.pop()!
  const hops: FieldMeta[] = []
  let current = modelName
  for (const name of segments) {
    const meta = modelFields(current).get(name)
    if (meta?.kind !== 'object') {
      throw new Error(`[paginator] "${name}" is not a relation of ${current} (in "${path}")`)
    }
    hops.push(meta)
    current = meta.type
  }
  const leafMeta = modelFields(current).get(leaf)
  if (leafMeta?.kind !== 'scalar' || leafMeta.type !== 'String') {
    throw new Error(`[paginator] "${leaf}" is not a String field of ${current} (in "${path}")`)
  }

  let condition: Record<string, unknown> = {
    [leaf]: { contains: search, mode: 'insensitive' },
  }
  for (let i = segments.length - 1; i >= 0; i--) {
    condition = hops[i].isList
      ? { [segments[i]]: { some: condition } }
      : { [segments[i]]: condition }
  }
  return condition
}

function searchConditions(
  fields: string[],
  search: string,
  modelName?: string,
): Record<string, unknown>[] {
  return fields.map((field) => {
    if (!field.includes('.')) {
      return { [field]: { contains: search, mode: 'insensitive' } }
    }
    if (!modelName) {
      throw new Error(`[paginator] modelName is required for relational search field "${field}"`)
    }
    return relationalCondition(modelName, field, search)
  })
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
    modelName,
    searchFields = [],
    allowedSorts = ['createdAt'],
    defaultSort = 'createdAt',
    defaultSortDir = 'desc',
    tieBreaker = 'id',
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
  const sortBy = allowedSorts.includes(sortByParam) ? sortByParam : defaultSort
  const sortDir = sortDirParam
    ? sortDirParam === 'asc'
      ? 'asc'
      : 'desc'
    : defaultSortDir
  const orderBy = [
    { [sortBy]: sortDir },
    ...(tieBreaker && tieBreaker !== sortBy ? [{ [tieBreaker]: sortDir }] : []),
  ]

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
              OR: searchConditions(searchFields, search, modelName),
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
      orderBy,
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
