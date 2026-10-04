// Purpose: Verify token, JWT, slug, response and pagination contracts without infrastructure.
// Caller: Node unit runner.
// Dependencies: Pure utility modules, jsonwebtoken, an in-memory Prisma delegate double.
// Main Functions: Utility regression cases.
// Side Effects: None.
import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { hashToken, generateToken } from '../../src/utils/token'
import { generateAccessToken } from '../../src/utils/jwt'
import { makeUniqueSlug, toSlug } from '../../src/utils/sluggable'
import { paginate } from '../../src/utils/paginator'

test('token: random hex token and deterministic SHA-256 hash', () => {
  const token = generateToken()
  assert.match(token, /^[0-9a-f]{128}$/)
  assert.notEqual(token, generateToken())
  assert.equal(hashToken(token).length, 64)
  assert.equal(hashToken(token), hashToken(token))
  assert.notEqual(hashToken(token), token)
})

test('jwt: access token carries the user id as a string subject and expires', () => {
  const token = generateAccessToken({ id: 42 })
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as jwt.JwtPayload
  assert.equal(payload.sub, '42')
  assert.ok(payload.exp! > payload.iat!)
})

test('slug: normalize text and resolve collisions while preserving the excluded id', async () => {
  assert.equal(toSlug('  Super Administrator! '), 'super-administrator')
  assert.equal(toSlug('a__b  c--d'), 'a-b-c-d')
  const seen: string[] = []
  const slug = await makeUniqueSlug(
    'Hello World',
    async (candidate, exclude) => {
      seen.push(candidate)
      assert.equal(exclude, 7)
      return seen.length < 3 ? { id: 1 } : null
    },
    7,
  )
  assert.deepEqual(seen, ['hello-world', 'hello-world-1', 'hello-world-2'])
  assert.equal(slug, 'hello-world-2')
})

function fakeRequest(query: Record<string, string>) {
  return {
    query,
    protocol: 'http',
    path: '/api/v1/items',
    get: () => 'test.invalid',
  } as any
}

function fakeDelegate(total: number) {
  const calls: { findMany: any[]; count: any[] } = { findMany: [], count: [] }
  return {
    calls,
    delegate: {
      async findMany(args: any) {
        calls.findMany.push(args)
        return Array.from({ length: Math.min(args.take, total - args.skip) }, (_, i) => ({
          id: args.skip + i + 1,
        }))
      },
      async count(args: any) {
        calls.count.push(args)
        return total
      },
    },
  }
}

test('paginator: clamp page size, whitelist sorting and share one filter between page and count', async () => {
  const { delegate, calls } = fakeDelegate(250)
  const result = await paginate(
    delegate,
    {
      where: { deletedAt: null },
      whereNot: { id: 1 },
      searchFields: ['name', 'email'],
      allowedSorts: ['createdAt', 'name'],
      transform: (row: { id: number }) => ({ key: row.id }),
    },
    fakeRequest({
      page: '2',
      per_page: '500',
      search: ' ali ',
      sort_by: 'password',
      sort_dir: 'asc',
    }),
  )
  const [findArgs] = calls.findMany
  assert.equal(findArgs.take, 100)
  assert.equal(findArgs.skip, 100)
  assert.deepEqual(findArgs.orderBy, { createdAt: 'asc' })
  assert.deepEqual(findArgs.where, calls.count[0].where)
  assert.deepEqual(findArgs.where, {
    AND: [
      { deletedAt: null, NOT: { id: 1 } },
      {
        OR: [
          { name: { contains: 'ali', mode: 'insensitive' } },
          { email: { contains: 'ali', mode: 'insensitive' } },
        ],
      },
    ],
  })
  assert.equal(result.data[0].key, 101)
  assert.equal(result.meta.total, 250)
  assert.equal(result.meta.last_page, 3)
  assert.equal(result.meta.from, 101)
  assert.equal(result.meta.to, 200)
  assert.match(result.meta.next_page_url!, /page=3/)
  assert.equal(result.links.length, 5)
})

test('paginator: defaults to newest first and reports an empty page safely', async () => {
  const { delegate, calls } = fakeDelegate(0)
  const result = await paginate(delegate, {}, fakeRequest({ page: '-4' }))
  assert.deepEqual(calls.findMany[0].orderBy, { createdAt: 'desc' })
  assert.equal(calls.findMany[0].skip, 0)
  assert.equal(calls.findMany[0].take, 15)
  assert.equal(result.meta.from, null)
  assert.equal(result.meta.to, null)
  assert.equal(result.meta.last_page, 1)
  assert.equal(result.meta.prev_page_url, null)
})
