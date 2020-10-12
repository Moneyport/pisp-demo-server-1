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
import { onUpdate } from '~/server/handlers/firestore/transactions'
import * as validator from '~/server/handlers/firestore/transactions.validator'
import { Transaction, Status } from '~/models/transaction'
import Client from '~/shared/ml-thirdparty-client'
import { Currency, PartyIdType } from '~/shared/ml-thirdparty-client/models/core'
import { transactionRepository } from '~/repositories/transaction'
import * as utils from '~/lib/utils'
import { AmountType } from '~/shared/ml-thirdparty-client/models/core'

// Mock firebase to prevent opening the connection
jest.mock('~/lib/firebase')

// Mock Mojaloop calls
const mockGetParties = jest.fn()
const mockPostTransactions = jest.fn()
const mockHandleAuthorization = jest.fn()
jest.mock('~/shared/ml-thirdparty-client', () => {
  return jest.fn().mockImplementation(() => {
    return {
      getParties: mockGetParties,
      postTransactions: mockPostTransactions,
      handleAuthorization: mockHandleAuthorization
    }
  })
})

// Mock validator functions
const mockIsValidPartyLookup = jest.spyOn(validator, 'isValidPartyLookup')
const mockIsValidPayeeConfirmation = jest.spyOn(validator, 'isValidPayeeConfirmation')
const mockIsValidAuthorization = jest.spyOn(validator, 'isValidAuthorization')

// Mock transaction repo functions
const mockUpdateById = jest.spyOn(transactionRepository, 'updateById')
mockUpdateById.mockResolvedValue()

// Mock consent repo functions

const featurePath = path.join(
  __dirname,
  '../features/firestore-transaction-handlers.feature'
)
const feature = loadFeature(featurePath)

defineFeature(feature, (test): void => {
  let server: StateServer
  let transaction: Transaction

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

  const whenTheTransactionUpdatedHasXStatus = (when: DefineStepFunction) => {
    when(
      /^the Transaction that has been updated has (.*) status$/,
      async (status: string): Promise<void> => {
        if (status === 'undefined') {
          transaction = {
            id: '1234',
          }
        } else {
          transaction = {
            transactionRequestId: 'request_id',
            sourceAccountId: 'a71ec534-ee48-4575-b6a9-ead2955b8069',
            consentId: 'b11ec534-ff48-4575-b6a9-ead2955b8069',
            id: '1234',
            amount: {
              amount: '12.00',
              currency: Currency.SGD,
            },
            status: status as Status,
            payee: {
              partyIdInfo: {
                partyIdType: PartyIdType.MSISDN,
                partyIdentifier: 'party_id',
              }
            }
          }
        }
        onUpdate(server, transaction)
      }
    )
  }
  test('Update Transaction With <Status> Status', ({
    given,
    when,
    then,
  }): void => {
    givenThePispDemoServer(given)

    whenTheTransactionUpdatedHasXStatus(when)

    then(/^the server should (.*) on Mojaloop$/, (action: String): void => {
      switch (action) {
        case 'log an error': {
          break;
        }
        case 'initiate party lookup': {
          expect(mockIsValidPartyLookup).toBeCalledTimes(1)
          expect(mockIsValidPartyLookup).toBeCalledWith(transaction)
          console.log((Client as jest.Mock).mock)
          expect(mockGetParties).toBeCalledTimes(1)
          expect(mockGetParties).toBeCalledWith(transaction.payee?.partyIdInfo.partyIdType,
            transaction.payee?.partyIdInfo.partyIdentifier)
          break;
        }
        case 'initiate payee confirmation': {
          expect(mockIsValidPayeeConfirmation).toBeCalledTimes(1)
          expect(mockIsValidPayeeConfirmation).toBeCalledWith(transaction)
          expect(mockPostTransactions).toBeCalledTimes(1)
          const expectedArg = {
            transactionRequestId: transaction.transactionRequestId,
            sourceAccountId: transaction.sourceAccountId,
            consentId: transaction.consentId,
            payee: transaction.payee,
            payer: expect.anything(),
            amountType: AmountType.RECEIVE,
            amount: transaction.amount!,
            transactionType: {
              scenario: 'TRANSFER',
              initiator: 'PAYER',
              initiatorType: 'CONSUMER',
            },
            expiration: utils.getTomorrowsDate().toISOString(),
          }
          expect(mockPostTransactions).toBeCalledWith(expectedArg, 'PLACEHOLDER')
          break;
        }
        case 'initiate authorization': {
          expect(mockIsValidAuthorization).toBeCalledTimes(1)
          expect(mockIsValidAuthorization).toBeCalledWith(transaction)
          break;
        }
      }
    })
  })
})