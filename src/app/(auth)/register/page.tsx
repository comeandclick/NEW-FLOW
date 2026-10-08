import type { Metadata } from 'next'
import { RegisterForm } from '@/components/auth-forms'
export const metadata: Metadata = { title: 'Inscription' }
export default function Page() { return <RegisterForm /> }
