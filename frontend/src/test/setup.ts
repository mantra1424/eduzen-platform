// Adds matchers like expect(element).toBeInTheDocument().
import '@testing-library/jest-dom/vitest'

import { unexpectedRequests } from './utils'

afterEach(() => {
  const unexpected = unexpectedRequests.splice(0)
  if (unexpected.length > 0) {
    throw new Error(`Test made requests its mockApi didn't list: ${unexpected.join(', ')}`)
  }
})
