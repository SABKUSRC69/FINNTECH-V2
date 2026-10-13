import { screen, within } from '@testing-library/react'
import { expect } from 'vitest'

/** The single row of "สินทรัพย์ที่คุณถือ" named `name` (optionally narrowed by its account/portfolio text). */
export function heldRow(name: string, account?: string): HTMLElement {
  const rows = within(screen.getByTestId('held-assets')).getAllByRole('row')
    .filter(row => row.querySelector('td p')?.textContent === name && (!account || row.textContent?.includes(account)))
  if (rows.length !== 1) throw new Error(`expected one held-asset row for ${name}, found ${rows.length}`)
  return rows[0]!
}
export function expectHeld(name: string, parts: string[], account?: string): void {
  const text = heldRow(name, account).textContent ?? ''
  for (const part of parts) expect(text).toContain(part)
}
