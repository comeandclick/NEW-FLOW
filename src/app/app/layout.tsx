import { SessionProvider } from '@/lib/hooks/use-session'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
