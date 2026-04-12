/**
 * Sluggable utility — Laravel-style auto-slug generation with onUpdate support.
 *
 * Usage:
 *   const slug = await makeUniqueSlug(
 *     sourceText,
 *     (candidate, excludeId) => repository.findBySlugExcluding(candidate, excludeId),
 *     excludeId,  // pass the record's own id on update, null on create
 *   )
 */

/**
 * Convert an arbitrary string into a URL-friendly slug.
 * e.g. "Super Administrator!" -> "super-administrator"
 */
function toSlug(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // strip non-word chars (keep letters, digits, _, spaces, -)
    .replace(/[\s_]+/g, '-') // spaces/underscores → hyphen
    .replace(/-+/g, '-') // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
}

/**
 * Generate a unique slug based on `sourceText`.
 *
 * @param {string}   sourceText  - The source string (e.g. name or title)
 * @param {Function} checkExists - async (slug, excludeId) => record | null
 * @param {number|null} excludeId - The id of the current record (for updates); null for creates
 * @returns {Promise<string>}
 */
async function makeUniqueSlug(sourceText, checkExists, excludeId = null) {
  const base = toSlug(sourceText)
  let slug = base
  let counter = 1

  while (true) {
    const conflict = await checkExists(slug, excludeId)
    if (!conflict) break
    slug = `${base}-${counter++}`
  }

  return slug
}

module.exports = { toSlug, makeUniqueSlug }
