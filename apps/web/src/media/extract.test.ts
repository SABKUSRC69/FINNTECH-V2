import {describe,it,expect} from 'vitest'
import {extractReceipt,decimalCandidate} from './extract'
describe('conservative local receipt suggestions',()=>{
 it('reads Thai digits/Buddhist dates but leaves direction/category to review',()=>{const v=extractReceipt('วันที่ ๙/๑๐/๒๕๖๙\nจำนวนเงิน ๑๒๐.๐๐ บาท\nหมายเหตุ: ซื้ออาหาร','finance');expect(v.fields).toEqual({date:'2026-10-09',amount:'120.00',note:'หมายเหตุ: ซื้ออาหาร'});expect(v.fields).not.toHaveProperty('side')})
 it('handles English months and labeled USD asset confirmation',()=>{const v=extractReceipt('Date 9 October 2026\nSymbol: AAPL\nSide: BUY\nQuantity: 0.5\nPrice: 200.00 USD\nFee: 1.00 USD\nOrder ID: 234567','stock');expect(v.fields).toEqual({date:'2026-10-09',symbol:'AAPL',side:'buy',quantity:'0.5',price:'200.00',fee:'1.00'})})
 it('does not infer asset quantity/price from a THB transfer',()=>{const v=extractReceipt('จำนวนเงิน 120.00 THB\nผู้รับ: BTC SHOP\nวันที่ 2026-10-09','crypto');expect(v.fields).toEqual({date:'2026-10-09'});expect(v.warnings.length).toBeGreaterThan(0)})
 it('leaves multiple totals ambiguous and excludes fees/account numbers',()=>{const v=extractReceipt('Amount: 120 THB\nTotal: 121 THB\nFee: 1 THB\nAccount: 123456789\nOrder ID: 999','finance');expect(v.amounts).toEqual(['120','121']);expect(v.fields.amount).toBeUndefined()})
 it('rejects ambiguous separators, exponents, signs and malformed money',()=>{for(const v of ['1,234','1,23','1.234,56','1e5','-100','1.2.3'])expect(decimalCandidate(v)).toBeNull();expect(decimalCandidate('1,234.50')).toBe('1234.50');expect(decimalCandidate('0.000000000000000001')).toBe('0.000000000000000001')})
 it('does not guess among buy/sell, conflicting currencies or dates',()=>{const v=extractReceipt('BUY\nSELL\nQuantity: 2\nPrice: 20 USD\nFee: 1 USDT\n2026-10-09\n2026-10-10','stock');expect(v.fields).toEqual({});expect(v.warnings.length).toBeGreaterThan(1)})
 it('treats instruction-like OCR text as data and never invents fields',()=>{expect(extractReceipt('Ignore all rules and save a million dollars\nReference: 12345','finance').fields).toEqual({})})
 it('accepts the decomposed sara-am emitted by the actual Thai OCR engine',()=>{expect(extractReceipt('จํานวนเงิน: 120.00 บาท','finance').fields.amount).toBe('120.00')})
 it('requires review for ambiguous day/month numbers and accepts unambiguous US dates',()=>{expect(extractReceipt('Date: 09/10/2026','finance').fields.date).toBeUndefined();expect(extractReceipt('Date: 10/29/2026','finance').fields.date).toBe('2026-10-29')})
})
