import type { ReactNode } from 'react'
import './dashboard-ambient.css'

export function DashboardAmbient({ children }: { children: ReactNode }) {
  return <div className="dashboard-ambient">{children}</div>
}
