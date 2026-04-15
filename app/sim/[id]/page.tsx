import { redirect } from 'next/navigation'

type SimRouteProps = {
  params: Promise<{ id: string }>
}

export default async function SimRoutePage({ params }: SimRouteProps) {
  const { id } = await params
  redirect(`/sim?sim=${encodeURIComponent(id)}`)
}
