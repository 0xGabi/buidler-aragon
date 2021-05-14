/* eslint-disable @typescript-eslint/camelcase */
import fetch from 'node-fetch'
import { DEFAULT_PINATA_API_ENDPOINT } from '../../../constants'
import { PinataConfig } from '../../../types'
import { log } from '../../ui/logger'

const PIN_BY_HASH_API = 'pinning/pinByHash'

export async function pinContent({
  contentHash,
  appEnsName,
  network,
  pinata,
}: {
  contentHash: string
  appEnsName: string
  network: string
  pinata: PinataConfig
}): Promise<any> {
  const url = DEFAULT_PINATA_API_ENDPOINT + PIN_BY_HASH_API
  const body = {
    hashToPin: contentHash,
    pinataMetadata: {
      name: `${network}:${appEnsName}`,
    },
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        pinata_api_key: pinata.key,
        pinata_secret_api_key: pinata.secret,
      },
    })

    const data = await response.json()

    return data
  } catch (error) {
    log(`Warning: Error while fetching pinata API with ${error}`)
    return
  }
}
