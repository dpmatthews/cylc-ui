/**
 * Copyright (C) NIWA & British Crown (Met Office) & Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { processMutations } from '@/utils/aotf'
import { cloneDeep, upperFirst } from 'lodash'
import {
  MUTATIONS
} from '../support/graphql'
import { Deferred } from '../../util'

describe('Mutations component', () => {
  beforeEach(() => {
    cy.visit('/#/tree/one')
  })

  /**
   * @param {string} nodeName - the tree node name, to search for and open the mutations form
   */
  const openMutationsForm = (nodeName) => {
    cy.get('[data-cy=tree-view]').as('treeView')
      .find('.treeitem')
      .find('.c-task')
      .should('be.visible')
    cy.get('@treeView')
      .find('span')
      .contains(nodeName)
      .parent()
      .find('.c-task')
      .click()
    cy
      .get('.c-mutation-menu-list:first')
      .find('[data-cy=mutation-edit]:first')
      .should('exist')
      .should('be.visible')
      .click()
  }

  /** Patch the list of available mutations */
  const mockMutations = () => {
    cy.window().its('app.$workflowService').then(service => {
      const mutations = cloneDeep(MUTATIONS)
      processMutations(mutations, [])
      service.introspection = Promise.resolve({
        mutations,
        types: [],
        queries: []
      })
      service.primaryMutations = {
        workflow: ['workflowMutation']
      }
    })
  }

  describe('Successful submission', () => {
    beforeEach(() => {
      mockMutations()
      // Patch graphql responses
      cy.intercept('/graphql', (req) => {
        const { query } = req.body
        if (query.startsWith('mutation')) {
          console.log(req)
          req.reply({
            data: {
              [req.body.operationName]: {
                result: [true, {}],
                __typename: upperFirst(req.body.operationName)
              }
            }
          })
        }
      })
    })

    it('should submit a mutation form', () => {
      openMutationsForm('BAD')
      // fill mocked mutation form with any data
      cy.get('.v-dialog')
        .within(() => {
          // type anything in the text inputs
          cy.get('input[type="text"]')
            .each(($el) => {
              cy.wrap($el).clear()
              cy.wrap($el).type('ABC')
            })
        })
        // click on the submit button
        .get('[data-cy="submit"]')
        .click()
        // form should close on successfull submission
        .get('.c-mutation-dialog')
        .should('not.exist')

      // It should not remember data after submission
      openMutationsForm('BAD')
      cy.get('.v-dialog')
        .within(() => {
          cy.get('input[type="text"]')
            .each(($el) => {
              cy.wrap($el).should('not.contain.value', 'ABC')
            })
        })
    })

    it('should stay open while submitting', () => {
      const deferred = new Deferred()
      cy.intercept('/graphql', req => {
        if (req.body.query.startsWith('mutation')) {
          // Cypress will await promise before continuing with the request
          return deferred.promise
        }
      })
      openMutationsForm('BAD')
      cy.get('[data-cy="submit"]')
        .click()
        .should('have.class', 'v-btn--loading')
        .get('.c-mutation-dialog')
        .should('be.visible')
        // Now let mutation response through
        .then(() => {
          cy.log('Resolve mutation')
          deferred.resolve()
        })
        // Now the form should close
        .get('.c-mutation-dialog')
        .should('not.exist')
    })
  })

  describe('Failed submission', () => {
    // Note: in offline mode, mutations currently fail by default without patching graphql
    it('should stay open if failed', () => {
      openMutationsForm('GOOD')
      cy.get('[data-cy="submit"]')
        .click()
        // Error snackbar should appear
        .get('[data-cy="response-snackbar"] > .v-snack__wrapper')
        .as('snackbar')
        .should('be.visible')
        .find('[data-cy="snackbar-close"]')
        .click()
        .get('@snackbar')
        .should('not.be.visible')
        // Form should stay open
        .get('.c-mutation-dialog')
        .should('be.visible')
        // Clicking cancel should close form
        .get('[data-cy="cancel"]')
        .click()
        .get('.c-mutation-dialog')
        .should('not.exist')
    })
  })

  it('should validate the form', () => {
    mockMutations()
    openMutationsForm('checkpoint')
    // Form should be valid initially
    cy.get('[data-cy=submit]').as('submit')
      .should('not.be.disabled')
      .should('not.have.class', 'error--text')
      // Indirect test for "form invalid" tooltip by checking aria-expanded attribute
      // (not ideal but it's way too troublesome to test visibility of .v-tooltip__content)
      .trigger('mouseenter')
      .should('have.attr', 'aria-expanded', 'false') // should not be visible
    // Now type invalid input
    cy.get('.c-mutation-dialog')
      .find('.v-list-item__title')
      .contains('workflow')
      .parent()
      .find('.v-input.v-text-field:first').as('textField')
      .find('input[type="text"]')
      .type(' ') // (spaces should not be allowed)
      .get('@textField')
      .should('have.class', 'error--text')
      .get('@submit')
      .should('have.class', 'error--text')
      .trigger('mouseenter')
      .should('have.attr', 'aria-expanded', 'true') // tooltip should be visible
      .should('not.be.disabled') // user can still submit if they really want to
  })
})
