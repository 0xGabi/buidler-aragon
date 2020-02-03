import chokidar from 'chokidar'
import {
  installAragonClientIfNeeded,
  startAragonClient,
  refreshClient
} from './client'
import { BuidlerRuntimeEnvironment } from '@nomiclabs/buidler/types'
import { logFront } from '../logger'
import { AragonConfig } from '~/src/types'
import {
  generateAppArtifacts,
  serveAppAndResolveWhenBuilt,
  copyAppUiAssets,
  startAppWatcher
} from './app'

/**
 * Starts the task's frontend sub-tasks. Logic is contained in ./tasks/start/utils/frontend/.
 * Retrieves the Aragon client using git, builds it, builds the app's frontend and serves the build.
 * Starts the Aragon client pointed at a Dao and an app, and watches for changes on the app's sources.
 * If changes are detected, the app's frontend is rebuilt.
 */
export async function startFrontend(
  bre: BuidlerRuntimeEnvironment,
  daoAddress: string,
  appAddress: string,
  openBrowser: boolean
): Promise<void> {
  const config: AragonConfig = bre.config.aragon as AragonConfig

  if (openBrowser) {
    await installAragonClientIfNeeded()
  }

  const appBuildOutputPath = config.appBuildOutputPath as string
  await generateAppArtifacts(appBuildOutputPath, bre.artifacts)

  const appSrcPath = config.appSrcPath as string
  await copyAppUiAssets(appSrcPath)
  await serveAppAndResolveWhenBuilt(appSrcPath)

  // Start Aragon client at the deployed address.
  if (openBrowser) {
    const url: string = await startAragonClient(
      config.clientServePort as number,
      `${daoAddress}/${appAddress}`
    )
    logFront(`You can now view the Aragon client in the browser.
   Local:  ${url}
  `)
  }

  // Watch changes to app/src/script.js.
  chokidar
    .watch('./app/src/script.js', {
      awaitWriteFinish: { stabilityThreshold: 1000 }
    })
    .on('change', async () => {
      logFront(`script.js changed`)

      await refreshClient()
    })

  await startAppWatcher(appSrcPath)
}
