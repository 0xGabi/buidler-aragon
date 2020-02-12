import chokidar from 'chokidar'
import { BuidlerRuntimeEnvironment } from '@nomiclabs/buidler/types'
import { createDao } from './dao'
import { deployImplementation } from './app'
import { createProxy, updateProxy } from './proxy'
import { createRepo, majorBumpRepo } from './repo'
import { setAllPermissionsOpenly } from './permissions'
import { KernelInstance, RepoInstance } from '~/typechain'
import { logBack } from '../logger'
import { readArapp } from '../arapp'
import { AragonConfig, AragonConfigHooks } from '~/src/types'
import { TASK_COMPILE } from '../../../task-names'
import deployAragonBases from './bases'
import { startGanache } from './ganache'
import { Writable } from 'stream'

/**
 * Starts the task's backend sub-tasks. Logic is contained in ./tasks/start/utils/backend/.
 * Creates a Dao and a Repo for the app in development and watches for changes in
 * contracts. When contracts change, it compiles the contracts, deploys them and updates the
 * proxy in the Dao.
 * @returns Promise<{ daoAddress: string, appAddress: string }> Dao and app address that can
 * be used with an Aragon client to view the app.
 */
export async function startBackend(
  bre: BuidlerRuntimeEnvironment,
  appName: string,
  appId: string,
  silent: boolean
): Promise<{ daoAddress: string; appAddress: string }> {
  const config: AragonConfig = bre.config.aragon as AragonConfig
  const hooks: AragonConfigHooks = config.hooks as AragonConfigHooks

  await _compileDisablingOutput(bre, silent)

  /**
   * Until BuidlerEVM JSON RPC is ready, a ganache server will be started
   * on the appropiate conditions.
   */
  await startGanache(bre)

  // Deploy bases.
  const { ensAddress, daoFactoryAddress, apmAddress } = await deployAragonBases(
    bre
  )

  // Read arapp.json.
  const arapp = readArapp()

  // Call preDao hook.
  if (hooks && hooks.preDao) {
    await hooks.preDao(bre)
  }

  // Prepare a DAO and a Repo to hold the app.
  const dao: KernelInstance = await createDao(
    bre.web3,
    bre.artifacts,
    daoFactoryAddress
  )
  const repo: RepoInstance = await createRepo(
    appName,
    appId,
    bre.web3,
    bre.artifacts,
    ensAddress,
    apmAddress
  )

  // Call postDao hook.
  if (hooks && hooks.postDao) {
    await hooks.postDao(dao, bre)
  }

  // Call preInit hook.
  if (hooks && hooks.preInit) {
    await hooks.preInit(bre)
  }

  // Call getInitParams hook.
  let proxyInitParams: any[] = []
  if (hooks && hooks.getInitParams) {
    const params = await hooks.getInitParams(bre)
    proxyInitParams = params ? params : proxyInitParams
  }
  if (proxyInitParams && proxyInitParams.length > 0) {
    logBack(`Proxy init params: ${proxyInitParams}`)
  }

  // Deploy first implementation and set it in the Repo and in a Proxy.
  const implementation: Truffle.ContractInstance = await deployImplementation(
    bre.artifacts
  )

  await majorBumpRepo(repo, implementation, config.appServePort as number)

  const proxy: Truffle.ContractInstance = await createProxy(
    implementation,
    appId,
    dao,
    bre.web3,
    bre.artifacts,
    proxyInitParams
  )

  // TODO: What if user wants to set custom permissions?
  // Use a hook? A way to disable all open permissions?
  await setAllPermissionsOpenly(dao, proxy, arapp, bre.web3, bre.artifacts)

  // Call postInit hook.
  if (hooks && hooks.postInit) {
    await hooks.postInit(proxy, bre)
  }

  // Watch back-end files.
  chokidar
    .watch('./contracts/', {
      awaitWriteFinish: { stabilityThreshold: 1000 }
    })
    .on('change', async () => {
      logBack(`<<< Triggering backend build >>>`)
      await _compileDisablingOutput(bre, silent)

      // Update implementation and set it in Repo and Proxy.
      const newImplementation: Truffle.ContractInstance = await deployImplementation(
        bre.artifacts
      )
      await majorBumpRepo(
        repo,
        newImplementation,
        config.appServePort as number
      )
      await updateProxy(newImplementation, appId, dao, bre.web3)

      // Call postUpdate hook.
      if (hooks && hooks.postUpdate) {
        await hooks.postUpdate(proxy, bre)
      }
    })

  logBack(`
  App name: ${appName}
  App id: ${appId}
  DAO: ${dao.address}
  Repo: ${repo.address}
  App proxy: ${proxy.address}
`)

  return { daoAddress: dao.address, appAddress: proxy.address }
}

/**
 * Buidler's compile task currently calls console.logs.
 * Until they can be disabled as an option, this workaround removes them.
 */
async function _compileDisablingOutput(
  bre: BuidlerRuntimeEnvironment,
  silent: boolean
): Promise<void> {
  logBack('compiling contracts...')

  const consoleCache = console

  if (silent) {
    // eslint-disable-next-line no-console
    console = new console.Console(new Writable())
  }

  await bre.run(TASK_COMPILE)

  console = consoleCache

  logBack('contracts compiled.')
}
