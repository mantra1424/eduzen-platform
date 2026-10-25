import { screen } from '@testing-library/react'

import { mockFetch, renderAt } from '../test/utils'

describe('home page', () => {
  it('shows that the API is running', async () => {
    mockFetch(200, { status: 'ok', database: 'ok' })
    renderAt('/')
    expect(await screen.findByText('API and database are running.')).toBeInTheDocument()
  })

  it('shows the error when the API is down', async () => {
    mockFetch(503, { detail: 'Database unavailable' })
    renderAt('/')
    expect(await screen.findByText(/API unavailable: Database unavailable/)).toBeInTheDocument()
  })
})

describe('unknown URLs', () => {
  it('show the not-found page', () => {
    renderAt('/no-such-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
