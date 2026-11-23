import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dir, 'stage-dist')
const html = readFileSync(join(dir, 'stage.html'), 'utf8')
const script = html.match(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/,
)
if (!script) throw Error('Stage bundle is missing')
const code = readFileSync(join(dir, script[1]), 'utf8')
// Inline the module for OBS local-file loading. Relative imports emitted for bundled artwork normally resolve from assets/.
const local = html.replace('<html ', '<html data-local-stage ')
  .replace(
    script[0],
    () =>
      '<script type="module">' +
      code
        .replaceAll(
          'import.meta.url',
          'new URL("./assets/stage.js",document.baseURI).href',
        )
        .replace(/<\/script/gi, '<\\/script') +
      '</script>',
  )
  .replace('rel="stylesheet" crossorigin', 'rel="stylesheet"')
writeFileSync(join(dir, 'stage-local.html'), local)

