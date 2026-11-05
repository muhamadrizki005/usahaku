import { cpSync, existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const destination = resolve(root, '.cache/custom-form-controls/build')
mkdirSync(destination, { recursive: true })
for (const name of ['app', 'components', 'lib', 'public', 'data', 'registry', 'package.json', 'tsconfig.json', 'next.config.mjs', 'postcss.config.mjs', 'components.json', 'proxy.ts', 'next-env.d.ts']) {
  if (existsSync(resolve(root, name))) cpSync(resolve(root, name), resolve(destination, name), { recursive: true })
}
if (!existsSync(resolve(destination, 'node_modules'))) symlinkSync(resolve(root, 'node_modules'), resolve(destination, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
mkdirSync(resolve(destination, 'app/preview/controls-qa'), { recursive: true })
cpSync(resolve(root, 'tests/fixtures/custom-controls-page.tsx'), resolve(destination, 'app/preview/controls-qa/page.tsx'))
console.log('Snapshot QA siap di .cache/custom-form-controls/build; environment tidak disalin.')
