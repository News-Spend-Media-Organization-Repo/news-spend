import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, isAbsolute } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const require = createRequire(import.meta.url)

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.css')) {
    let filePath = specifier

    if (!isAbsolute(filePath)) {
      // Try to resolve from parent URL
      if (context.parentURL) {
        const parentDir = dirname(fileURLToPath(context.parentURL))
        const basePath = fileURLToPath(new URL('file://'))
        try {
          filePath = require.resolve(specifier, { paths: [parentDir] })
        } catch {
          filePath = require.resolve(specifier)
        }
      } else {
        filePath = require.resolve(specifier)
      }
    }

    return {
      shortCircuit: true,
      url: pathToFileURL(filePath).href,
      format: 'module',
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  // Strip query parameters like ?tsx-namespace=...
  let cleanUrl = url.split('?')[0]

  if (cleanUrl.endsWith('.css')) {
    const filePath = fileURLToPath(cleanUrl)

    if (!existsSync(filePath)) {
      throw new Error(`CSS file not found: ${filePath}`)
    }

    const cssContent = readFileSync(filePath, 'utf8')
    const jsContent = `export default ${JSON.stringify(cssContent)};`
    return {
      shortCircuit: true,
      format: 'module',
      source: jsContent,
    }
  }
  return nextLoad(url, context)
}
