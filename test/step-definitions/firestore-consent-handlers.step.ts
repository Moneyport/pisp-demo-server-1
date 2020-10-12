/*****
 License
 --------------
 Copyright © 2020 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the 'License') and you may not use these files except in compliance with the License. You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation organization for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.
 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 * Google
 - Kenneth Zeng <kkzeng@google.com>
 --------------
 ******/

import path from 'path'
import { loadFeature, defineFeature, DefineStepFunction } from 'jest-cucumber'
import Config from '~/lib/config'
import PispDemoServer from '~/server'
import { onCreate, onUpdate } from '~/server/handlers/firestore/consents'
import * as validator from '~/server/handlers/firestore/consents.validator'
import {
  AuthenticationResponseType,
  AuthenticationType,
  Currency,
  PartyIdType,
  AmountType,
} from '~/shared/ml-thirdparty-client/models/core'
import { consentRepository } from '~/repositories/consent'
import { Party } from '~/shared/ml-thirdparty-client/models/core/parties'
import { Consent, ConsentStatus } from '~/models/consent'

// Mock firebase to prevent opening the connection
jest.mock('~/lib/firebase')

// Mock Mojaloop calls
const mockGetParties = jest.fn()
const mockPutConsentRequests = jest.fn()
const mockPostConsentRequests = jest.fn()
const postGenerateChallengeForConsent = jest.fn()
const mockPutConsentId = jest.fn()
const mockPostRevokeConsent = jest.fn()
jest.mock('~/shared/ml-thirdparty-client', () => {
  return jest.fn().mockImplementation(() => {
    return {
      getParties: mockGetParties,
      putConsentRequests: mockPutConsentRequests,
      postConsentRequests: mockPostConsentRequests,
      postGenerateChallengeForConsent: postGenerateChallengeForConsent,
      putConsentId: mockPutConsentId,
      postRevokeConsent: mockPostRevokeConsent,
    }
  })
})

// Mock validator functions

// Mock transaction repo functions
const mockUpdateConsentById = jest.spyOn(consentRepository, 'updateConsentById')
mockUpdateConsentById.mockResolvedValue()

// Mock consent repo functions
const party: Party = {
  partyIdInfo: {
    partyIdType: PartyIdType.MSISDN,
    partyIdentifier: 'party_id',
  },
}

const featurePath = path.join(
  __dirname,
  '../features/firestore-consent-handlers.feature'
)
const feature = loadFeature(featurePath)

defineFeature(feature, (test): void => {
  let server: StateServer
  let consent: Consent

  afterEach(
    async (done): Promise<void> => {
      server.events.on('stop', done)
      await server.stop()
    }
  )

  // Define reused steps
  const givenThePispDemoServer = (given: DefineStepFunction) => {
    given(
      'pisp-demo-server',
      async (): Promise<Server> => {
        server = await PispDemoServer.run(Config)
        return server
      }
    )
  }

  const whenTheConsentUpdatedHasXStatus = (when: DefineStepFunction) => {
    when(
      /^the Consent that has been updated has (.*) status$/,
      async (status: string): Promise<void> => {
        if (status === 'undefined') {
          consent = {
            id: '1234',
          }
        } else {
          consent = {
            id: '1234',
            status: status as ConsentStatus,
            party: party,
          }
        }
        await onUpdate(server, consent)
      }
    )
  }
  test('Create Consent With Existing Status', ({ given, when, then }): void => {
    givenThePispDemoServer(given)

    when(
      'I create a Consent with an existing status',
      async (): Promise<void> => {
        consent = {
          id: '1234',
          status: ConsentStatus.PENDING_PARTY_CONFIRMATION,
        }
        await onCreate(server, consent)
      }
    )

    then('the server should do nothing', (): void => {
      expect(mockUpdateConsentById).not.toBeCalled()
    })
  })

  test('Create New Consent', ({ given, when, then }): void => {
    givenThePispDemoServer(given)

    when(
      'a new Consent is created',
      async (): Promise<void> => {
        consent = {
          id: '1234',
        }
        await onCreate(server, consent)
      }
    )

    then(
      'the server should assign a transactionRequestId and a new status in the transaction repository',
      (): void => {
        expect(mockUpdateConsentById).toBeCalledTimes(1)
        expect(mockUpdateConsentById).toBeCalledWith(consent.id, {
          consentRequestId: expect.any(String),
          status: ConsentStatus.PENDING_PARTY_LOOKUP,
        })
      }
    )
  })
  test('Update Consent With <Status> Status', ({ given, when, then }): void => {
    givenThePispDemoServer(given)

    whenTheConsentUpdatedHasXStatus(when)

    then(/^the server should (.*) on Mojaloop$/, (action: string): void => {
      switch (action) {
        case 'log an error': {
          break
        }
        case 'initiate party lookup': {
          break
        }
        case 'initiate consent request': {
          break
        }
        case 'initiate authentication': {
          break
        }
        case 'initiate challenge generation': {
          break
        }
        case 'handle signed challenge': {
          break
        }
        case 'initiate revocation for consent': {
          break
        }
      }
    })
  })
})