// Purpose: Prove the paginator against PostgreSQL: stable pages over duplicate sort values,
//   relational search through to-one and to-many relations, and one filter for page and count.
// Caller: Node integration runner.
// Dependencies: Paginator, role repository (real consumer), application Prisma client,
//   isolated PostgreSQL, fixtures.
// Main Functions: Stable paging and relational search cases.
// Side Effects: Writes isolated role and user rows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setupIntegration, db } from '../support/integration'
import { paginate } from '../../src/utils/paginator'
import roleRepository from '../../src/modules/role/role.repository'
import prisma from '../../src/config/database'

setupIntegration()

const request = (query: Record<string, string>) =>
  ({ query, protocol: 'http', path: '/api/v1/items', get: () => 'test.invalid' }) as any

test('paginator: pages over a sort column full of duplicates neither repeat nor skip rows (regression)', async () => {
  // More than twice OFFSET + LIMIT rows: PostgreSQL then uses a bounded heap sort whose order
  // among equal keys differs per page. Before T6 seven pages returned 98 distinct rows of 100.
  const createdAt = new Date('2026-01-01T00:00:00Z')
  await db.role.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      slug: `role-${i}`,
      title: `Role ${i}`,
      userType: 'Administrator',
      createdAt,
    })),
  })
  const queries: Record<string, string>[] = [{ sort_by: 'userType' }, {}]
  for (const query of queries) {
    const seen: number[] = []
    for (let page = 1; page <= 7; page++) {
      const result = await roleRepository.getRoles(request({ ...query, page: String(page) }))
      seen.push(...result.data.map((role) => role.id))
      assert.equal(result.meta.total, 100)
    }
    assert.equal(seen.length, 100)
    assert.equal(new Set(seen).size, 100, `duplicates for ${JSON.stringify(query)}`)
  }
})

test('paginator: relational search matches through to-one and to-many relations with one shared filter', async () => {
  const ops = await db.role.create({
    data: { slug: 'ops', title: 'Operations', userType: 'Administrator' },
  })
  const sales = await db.role.create({
    data: { slug: 'sales', title: 'Sales', userType: 'Administrator' },
  })
  for (const [name, roleId] of [
    ['Ann', ops.id],
    ['Ben', ops.id],
    ['Cid', sales.id],
    ['Operator Dee', sales.id],
  ] as const)
    await db.user.create({
      data: { name, email: `${name.split(' ').pop()!.toLowerCase()}@example.invalid`, roleId },
    })

  const users = await paginate(
    prisma.user,
    {
      modelName: 'User',
      select: { name: true },
      searchFields: ['name', 'role.title'],
      allowedSorts: ['name'],
    },
    request({ search: 'OPER', sort_by: 'name', sort_dir: 'asc', per_page: '2' }),
  )
  assert.equal(users.meta.total, 3)
  assert.equal(users.meta.last_page, 2)
  assert.deepEqual(
    users.data.map((user: { name: string }) => user.name),
    ['Ann', 'Ben'],
  )

  const roles = await paginate(
    prisma.role,
    { modelName: 'Role', select: { slug: true }, searchFields: ['users.email'] },
    request({ search: 'dee@' }),
  )
  assert.deepEqual(
    roles.data.map((role: { slug: string }) => role.slug),
    ['sales'],
  )
  assert.equal(roles.meta.total, 1)
})
