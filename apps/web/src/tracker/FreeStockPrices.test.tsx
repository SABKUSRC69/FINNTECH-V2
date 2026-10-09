// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import FreeStockPrices, { stockWidgetUrl } from './FreeStockPrices'

afterEach(cleanup)
describe('free provider-owned stock display', () => {
  it('can display every supported instrument without a server key and changes symbols', () => {
    render(<FreeStockPrices />)
    expect(screen.getByTitle('ราคาหุ้น AAPL โดย TradingView')).toBeTruthy()
    expect(screen.queryByTitle('ราคาและกราฟหุ้น AAPL โดย TradingView')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'SPY' }))
    const frame = screen.getByTitle('ราคาหุ้น SPY โดย TradingView') as HTMLIFrameElement
    expect(frame.src).toContain('https://s.tradingview.com/')
    expect(JSON.parse(decodeURIComponent(new URL(frame.src).hash.slice(1))).symbol).toBe('AMEX:SPY')
    fireEvent.click(screen.getByRole('button',{name:'ดูกราฟราคา'}))
    expect(screen.getByTitle('ราคาและกราฟหุ้น SPY โดย TradingView')).toBeTruthy()
    expect(screen.getByText(/ราคาอาจหน่วงเวลา/)).toBeTruthy()
    expect(screen.getByText(/ยังไม่ส่งตัวเลขกลับมาคำนวณ/)).toBeTruthy()
  })
  it('sends only public chart configuration and validates symbol identity', () => {
    for (const symbol of ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'TSLA', 'SPY', 'QQQ']) {
      const url = new URL(stockWidgetUrl(symbol, 'dark'))
      expect(url.origin).toBe('https://s.tradingview.com')
      expect(url.searchParams.get('locale')).toBe('en')
      const config = JSON.parse(decodeURIComponent(url.hash.slice(1)))
      expect(config.colorTheme).toBe('dark')
      expect(Object.keys(config).some(key => /owner|quantity|cost|secret|token/i.test(key))).toBe(false)
    }
    expect(() => stockWidgetUrl('AAPL#attacker', 'light')).toThrow()
  })
})
