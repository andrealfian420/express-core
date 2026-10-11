// Purpose: HTML policy for template bodies saved through the editor: keep email markup (inline
//   styles, tables, links to {{placeholders}}) and drop scripts, event handlers and unsafe URLs.
// Caller: email-template.validation (update schema transform).
// Dependencies: xss (js-xss FilterXSS with a custom allowlist).
// Main Functions: sanitizeTemplateHtml.
// Side Effects: None.
// Notes: The global xss middleware skips `body` on the template update route only (see
//   middleware/xss.middleware.ts) because its default allowlist strips the inline styles and
//   placeholder links emails need; this filter replaces it there. CSS values are not filtered
//   (css: false): email clients apply their own CSS sanitizing and the editor is
//   permission-gated.
import { FilterXSS, getDefaultWhiteList, safeAttrValue } from 'xss'

const PLACEHOLDER_ONLY = /^\{\{\s*[a-zA-Z0-9_]+\s*\}\}$/

const whiteList = getDefaultWhiteList()
for (const tag of Object.keys(whiteList)) {
  whiteList[tag] = [...new Set([...(whiteList[tag] ?? []), 'style'])]
}
whiteList.table = [...new Set([...(whiteList.table ?? []), 'cellpadding', 'cellspacing', 'role'])]

const filter = new FilterXSS({
  whiteList,
  css: false,
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
  safeAttrValue(tag, name, value, cssFilter) {
    if ((name === 'href' || name === 'src') && PLACEHOLDER_ONLY.test(value.trim())) {
      return value.trim()
    }
    return safeAttrValue(tag, name, value, cssFilter)
  },
})

export function sanitizeTemplateHtml(html: string): string {
  return filter.process(html)
}
