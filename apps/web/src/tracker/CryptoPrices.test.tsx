import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import CryptoPrices from './CryptoPrices'
import type { MarketSnapshot } from '@finntech/contracts'

afterEach(cleanup)
const now = Date.parse('2026-10-08T20:00:00Z')
const snapshot: MarketSnapshot = { quotes: [{ asset: 'BTC', price: '80000.12345678', status: 'LIVE', source: 'Binance public', kind: 'TRADE', receivedAt: new Date(now).toISOString(), observedAt: new Date(now).toISOString() }] }
describe('prices independent of owned holdings', () => {
  it('shows all seven instruments without a portfolio and updates genuine prices without reload', () => {
    const view = render(<CryptoPrices market={snapshot} now={now} />)
    expect(screen.getAllByRole('article')).toHaveLength(7)
    const bitcoin = screen.getByRole('article', { name: 'ราคาคริปโต BTC' })
    expect(within(bitcoin).getByText(/80,000.12345678/)).toBeTruthy()
    view.rerender(<CryptoPrices market={{ quotes: [{ ...snapshot.quotes[0]!, price: '80001' }] }} now={now} />)
    expect(within(bitcoin).getByText(/80,001/)).toBeTruthy()
  })
  it('keeps an expired price visibly labeled old and never invents an unavailable quote', () => {
    render(<CryptoPrices market={snapshot} now={now + 30001} />)
    expect(within(screen.getByRole('article', { name: 'ราคาคริปโต BTC' })).getByText('ราคาเก่า')).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'ราคาคริปโต ADA' })).getByText(/กำลังรอราคา/)).toBeTruthy()
    expect(screen.queryByText('ราคาสด')).toBeNull()
  })
})
