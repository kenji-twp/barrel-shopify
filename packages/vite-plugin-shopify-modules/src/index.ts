import { promises as fs, existsSync } from 'fs'
import path from 'path'
import { Plugin, ResolvedConfig } from 'vite'
import { throttle } from 'lodash'
import chokidar from 'chokidar'
import glob from 'fast-glob'

import { VitePluginShopifyModulesOptions, ResolvedVitePluginShopifyModulesOptions, resolveOptions } from './options'

export default function shopifyModules (options: VitePluginShopifyModulesOptions = {}): Plugin {
  const resolvedOptions = resolveOptions(options)
  let _config: ResolvedConfig

  // Create throttled function for generating module symlinks
  const linkModulesFn = throttle(
    linkModules.bind(null, resolvedOptions),
    500,
    {
      leading: true,
      trailing: false
    }
  )

  return {
    name: 'vite-plugin-shopify-modules',
    enforce: 'post',
    config () {
      return {
        resolve: {
          alias: {
            '@modules': path.resolve(resolvedOptions.modulesDir),
            '~modules': path.resolve(resolvedOptions.modulesDir)
          }
        }
      }
    },
    configResolved (config) {
      _config = config
    },
    resolveId: async (id) => {
      // Check if path is within modules directory
      if (!path.relative(path.resolve(resolvedOptions.modulesDir), id).includes('..')) {
        const fileStat = await fs.stat(id)

        // Check if path refers to folder instead of file
        if (fileStat.isDirectory()) {
          // Check if module script file exists matching folder name
          const results = await glob(`${id}/${path.basename(id)}.{js,jsx,ts,tsx}`, { onlyFiles: true })

          // Resolve to actual file path instead of module shorthand
          if (results.length > 0) {
            return results[0]
          }
        }
      }
    },
    buildStart: () => {
      // Link modules on build start
      linkModulesFn()

      if (_config.command === 'serve') {
        // Watch for relevant file or directory changes to re-run script
        chokidar.watch([resolvedOptions.modulesDir, '(sections|snippets)/*.liquid'], {
          ignoreInitial: true,
          followSymlinks: false
        }).on('all', linkModulesFn)
      }
    }
  }
}

// Check for module folders with corresponding liquid files and set up symlinks as needed
const linkModules = ({ modulesDir, themeRoot }: ResolvedVitePluginShopifyModulesOptions): void => {
  const rootPath = path.resolve(themeRoot)
  const sectionsDir = path.resolve(rootPath, './sections')
  const snippetsDir = path.resolve(rootPath, './snippets')
  const templatesDir = path.resolve(rootPath, './templates')

  if (existsSync(modulesDir)) {
    fs.readdir(modulesDir)
      .then(
        async (modules: string[]) => await Promise.all(modules.flatMap((module) => [
          setupModuleSymlink(module, { modulesDir, sectionsDir, snippetsDir, templatesDir })
        ])),
        (err) => { throw err }
      )
  }
}

// Set up symlink for module's liqui files
const setupModuleSymlink = async (moduleName: string, pathConfig: { modulesDir: string, sectionsDir: string, snippetsDir: string, templatesDir: string }): Promise<void> => {
  const moduleDir = path.join(pathConfig.modulesDir, moduleName)
  const liquidFiles = await glob(`${moduleDir}/*.liquid}`, { onlyFiles: true })
  const sectionFileRegex = /\.section\.liquid$/
  const templateFileRegex = /\.template\.liquid$/

  for (const liquidFile of liquidFiles) {
    const liquidFilePath = path.join(moduleDir, liquidFile)

    // Check if file is section file
    if (liquidFile.match(sectionFileRegex)) {
      const themeSectionPath = path.join(pathConfig.sectionsDir, liquidFile.replace(sectionFileRegex, ''))

      return await setupSymlink(liquidFilePath, themeSectionPath)
    }

    // Check if file is template file
    if (liquidFile.match(templateFileRegex)) {
      const themeTemplatePath = path.join(pathConfig.sectionsDir, liquidFile.replace(templateFileRegex, ''))

      return await setupSymlink(liquidFilePath, themeTemplatePath)
    }

    // Otherwise, file is snippet file
    const themeSnippetPath = path.join(pathConfig.snippetsDir, liquidFile)

    return await setupSymlink(liquidFilePath, themeSnippetPath)
  }
}

// Move liquid file from module path to theme path and generate symbolic link
const setupSymlink = async (modulePath: string, themePath: string): Promise<void> => {
  let modulePathStats

  try {
    modulePathStats = await fs.lstat(modulePath)
  } catch (e) {
    //
  }

  if (typeof modulePathStats === 'undefined') {
    if (existsSync(themePath)) {
      // If theme file exists but hasn't been linked, create symlink
      await fs.symlink(path.relative(path.dirname(modulePath), themePath), modulePath)
    }

    // If no existing file at module path, skip
    return
  }

  if (modulePathStats.isSymbolicLink()) {
    if (!existsSync(themePath)) {
      // If symlink exists without target file, delete it
      await fs.unlink(modulePath)
    }

    // If module path file is already a symlink, skip
    return
  }

  if (existsSync(themePath)) {
    // If theme path file already exists, log warning and skip
    console.warn(`WARNING: Conflicting liquid files found at ${modulePath} and ${themePath}.`)
    return
  }

  // Move liquid file to theme folder
  await fs.rename(modulePath, themePath)

  // Generate symlink from module path to theme path
  await fs.symlink(path.relative(path.dirname(modulePath), themePath), modulePath)
}
