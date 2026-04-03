import { Suspense } from 'react'

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>
}
