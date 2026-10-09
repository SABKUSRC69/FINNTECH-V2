// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import StockPortfolioValue, { stockPortfolioFormula, portfolioWidgetUrl } from './StockPortfolioValue'
import { PresentationProvider, PresentationControls } from '../presentation'

afterEach(cleanup)
const holdings = [{ symbol: 'AAPL', quantity: '0.5', totalCost: '51' }]
describe('free stock portfolio chart privacy and arithmetic', () => {
  it('aggregates repeated symbols, supports fractions, subtracts remaining cost and omits closed positions', () => {
    expect(stockPortfolioFormula([...holdings, { symbol: 'AAPL', quantity: '1.5', totalCost: '149.01' }, { symbol: 'SPY', quantity: '0', totalCost: '0' }]))
      .toEqual({ value: 'NASDAQ:AAPL*2', unrealized: 'NASDAQ:AAPL*2-200.01' })
    expect(stockPortfolioFormula([{ symbol: 'QQQ', quantity: '2', totalCost: null }]))
      .toEqual({ value: 'NASDAQ:QQQ*2', unrealized: null })
    expect(stockPortfolioFormula([{ symbol: 'unknown', quantity: '1', totalCost: '1' }])).toBeNull()
    expect(stockPortfolioFormula([{ symbol: 'AAPL', quantity: '-1', totalCost: '1' }])).toBeNull()
    expect(() => portfolioWidgetUrl('NASDAQ:AAPL*1#token=secret', 'light')).toThrow()
  })
  it('requires opt-in, updates quantities without discarding it, and keeps large charts optional', () => {
    const view = render(<StockPortfolioValue holdings={holdings} />)
    expect(document.querySelector('iframe[title*="พอร์ตหุ้น"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ' }))
    let frame = screen.getByTitle('มูลค่าพอร์ตหุ้น USD โดย TradingView') as HTMLIFrameElement
    expect(JSON.parse(decodeURIComponent(new URL(frame.src).hash.slice(1))).symbol).toBe('NASDAQ:AAPL*0.5')
    expect(screen.queryByTitle('กราฟมูลค่าพอร์ตหุ้น USD')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'กำไร/ขาดทุนยังไม่รับรู้ USD' }))
    frame = screen.getByTitle('กำไรขาดทุนพอร์ตหุ้น USD โดย TradingView') as HTMLIFrameElement
    expect(JSON.parse(decodeURIComponent(new URL(frame.src).hash.slice(1))).symbol).toBe('NASDAQ:AAPL*0.5-51')
    view.rerender(<StockPortfolioValue holdings={[{ ...holdings[0]!, quantity: '1' }]} />)
    frame = screen.getByTitle('กำไรขาดทุนพอร์ตหุ้น USD โดย TradingView') as HTMLIFrameElement
    expect(JSON.parse(decodeURIComponent(new URL(frame.src).hash.slice(1))).symbol).toBe('NASDAQ:AAPL*1-51')
    expect(screen.queryByRole('button', { name: 'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ' })).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'ดูกราฟย้อนหลังพอร์ต'}))
    expect(screen.getByTitle('กราฟกำไรขาดทุนพอร์ตหุ้น USD')).toBeTruthy()
  })
  it('allows closing the chart and never sends identity or transaction history', () => {
    render(<PresentationProvider><StockPortfolioValue holdings={holdings} /></PresentationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ' }))
    const frame = screen.getByTitle('มูลค่าพอร์ตหุ้น USD โดย TradingView') as HTMLIFrameElement
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(frame.src).not.toMatch(/owner|email|password|token|portfolioId|transactions/)
    fireEvent.click(screen.getByRole('button', { name: 'ปิดกราฟพอร์ต' }))
    expect(document.querySelector('iframe[title*="พอร์ตหุ้น"]')).toBeNull()
  })
  it('removes the financial chart when amounts are hidden', () => {
    render(<PresentationProvider><PresentationControls /><StockPortfolioValue holdings={holdings} /></PresentationProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'ยินยอมเปิดกราฟและอัปเดตหลังบันทึกอัตโนมัติ' }))
    expect(screen.getByTitle('มูลค่าพอร์ตหุ้น USD โดย TradingView')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อนยอดเงิน' }))
    expect(document.querySelector('iframe[title*="พอร์ตหุ้น"]')).toBeNull()
    expect(screen.getByText('ซ่อนยอดเงินแล้ว · กราฟมูลค่าพอร์ตถูกซ่อนด้วย')).toBeTruthy()
  })
})
