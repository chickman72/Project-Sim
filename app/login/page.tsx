import { redirect } from 'next/navigation'

type LoginPageProps = {
  searchParams?: Promise<{ success?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sp = searchParams ? await searchParams : undefined
  const params = new URLSearchParams()
  if (sp?.success) params.set('success', sp.success)
  if (sp?.message) params.set('message', sp.message)
  redirect(params.toString() ? `/?${params.toString()}` : '/')
}
