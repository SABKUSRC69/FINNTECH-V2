import { createContext, useContext, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
export type IconName = 'finance' | 'budget' | 'crypto' | 'stocks' | 'backup' | 'assets' | 'account' | 'more' | 'sun' | 'moon' | 'eye' | 'shield' | 'notebook' | 'close'
type Presentation = {
  theme: Theme
  hidden: boolean
  toggleTheme: () => void
  toggleAmounts: () => void
  money: (formatted: string) => string
}

const PresentationContext = createContext<Presentation>({
  theme: 'light', hidden: false, toggleTheme: () => {}, toggleAmounts: () => {}, money: value => value,
})

export function PresentationProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setTheme] = useState<Theme>('light')
  const [hidden, setHidden] = useState(false)
  // Presentation stays in memory; no account/storage data is read or migrated.
  return <PresentationContext.Provider value={{
    theme, hidden, toggleTheme: () => setTheme(value => value === 'light' ? 'dark' : 'light'),
    toggleAmounts: () => setHidden(value => !value), money: value => hidden && value !== 'N/A' ? '••••' : value,
  }}>{children}</PresentationContext.Provider>
}

export const usePresentation = (): Presentation => useContext(PresentationContext)

const paths: Record<IconName, ReactNode> = {
  notebook: <><rect x="5" y="3" width="15" height="18" rx="3" /><path d="M3 7h4M3 12h4M3 17h4M11 8h5M11 12h5M11 16h3" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  assets: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M7 7V4h10v3M15 12h6v5h-6z" /></>,
  finance: <path d="M7 4v16m0 0-4-4m4 4 4-4M17 20V4m0 0-4 4m4-4 4 4" />,
  budget: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 10h18M7 3v4m10-4v4M7 14h3m4 0h3M7 17h3" /></>,
  crypto: <><path d="M12 3v9h9A9 9 0 0 0 12 3Z" /><path d="M8 4a9 9 0 1 0 12 12M8 4v12h12" /></>,
  stocks: <path d="M4 4v16h16M7 15l4-4 4 2 5-7M16 6h4v4" />,
  backup: <path d="M12 3v12m-4-4 4 4 4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M20 14A8 8 0 0 1 10 4a9 9 0 1 0 10 10Z" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
}

export function Icon({ name }: { name: IconName }): JSX.Element {
  return <svg className="tracker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}

/** Original local artwork, decorative only: never a control or financial state. */
export function NotebookCat({ compact = false }: { compact?: boolean }): JSX.Element {
  return <img className={`notebook-cat${compact ? ' notebook-cat-small' : ''}`} src="/art/notebook-cat.svg" alt="" aria-hidden="true" draggable={false} />
}

export function PresentationControls(): JSX.Element {
  const { theme, hidden, toggleTheme, toggleAmounts } = usePresentation()
  return <div className="tracker-display-controls">
    <button type="button" className="tracker-icon-button" aria-label={hidden ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'} aria-pressed={hidden} onClick={toggleAmounts}><Icon name="eye" /></button>
    <button type="button" className="tracker-icon-button" aria-label={theme === 'light' ? 'เปิดโหมดมืด' : 'เปิดโหมดสว่าง'} aria-pressed={theme === 'dark'} onClick={toggleTheme}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
  </div>
}
