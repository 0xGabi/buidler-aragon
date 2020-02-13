import path from 'path'
import fsExtra from 'fs-extra'
import { execaLogTo, execaRun } from '../execa'
import { generateApplicationArtifact } from '../../../../utils/generateArtifacts'
import { readArapp, getMainContractName, getMainContractPath } from '../arapp'
import { TruffleEnvironmentArtifacts } from '@nomiclabs/buidler-truffle5/src/artifacts'

export const manifestPath = 'manifest.json'

/**
 * Calls the app's aragon/ui copy-aragon-ui-assets script.
 */
export async function copyAppUiAssets(appSrcPath: string): Promise<void> {
  await execaRun('npm', ['run', 'sync-assets'], { cwd: appSrcPath })
}

/**
 * Calls the app's front end build watcher.
 */
export async function startAppWatcher(appSrcPath: string): Promise<void> {
  await execaRun('npm', ['run', 'watch'], { cwd: appSrcPath })
}

/**
 * Starts the app's front end sever.
 */
export async function serveAppAndResolveWhenBuilt(
  appSrcPath: string,
  appServePort: number
): Promise<void> {
  return new Promise(async resolve => {
    const logger = (data: string): void => {
      if (data.includes('Built in')) {
        resolve()
      }
    }

    await execaLogTo(logger)(
      'npm',
      ['run', 'serve', '--', '--port', `${appServePort}`],
      { cwd: appSrcPath }
    )
  })
}

/**
 * Generates the artifacts necessary for an Aragon App.
 * - manifest.json
 * - artifact.json
 */
export async function generateAppArtifacts(
  appBuildOutputPath: string,
  artifacts: TruffleEnvironmentArtifacts
): Promise<void> {
  await _copyManifest(appBuildOutputPath)
  await _generateUriArtifacts(appBuildOutputPath, artifacts)
}

async function _copyManifest(appBuildOutputPath: string): Promise<void> {
  await fsExtra.copy(
    manifestPath,
    path.join(appBuildOutputPath as string, manifestPath)
  )
}

async function _generateUriArtifacts(
  appBuildOutputPath: string,
  artifacts: TruffleEnvironmentArtifacts
): Promise<void> {
  // Retrieve main contract abi.
  const mainContractName: string = getMainContractName()
  const App: any = artifacts.require(mainContractName)
  const abi = App.abi

  // Retrieve contract source code.
  const mainContractPath = getMainContractPath()
  const source = await fsExtra.readFileSync(mainContractPath, 'utf8')

  // Retrieve arapp file.
  const arapp = readArapp()

  // Generate artifacts file.
  const appArtifacts = await generateApplicationArtifact(arapp, abi, source)

  // Write artifacts to file.
  await fsExtra.writeJSON(
    path.join(appBuildOutputPath as string, 'artifact.json'),
    appArtifacts,
    { spaces: 2 }
  )
}
