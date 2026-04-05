import { NextRequest, NextResponse } from 'next/server'

type SessionInfo = {
  userId?: string
  role?: 'Administrator' | 'Instructor' | 'Student'
}

const roleHome = (role?: string) => {
  if (role === 'Student') return '/sim'
  if (role === 'Instructor') return '/config'
  if (role === 'Administrator') return '/admin'
  return '/'
}

const getSessionInfo = async (request: NextRequest): Promise<SessionInfo | null> => {
  try {
    const cookie = request.headers.get('cookie') || ''
    const meUrl = new URL('/api/auth/me', request.url)

    const resp = await fetch(meUrl, {
      headers: { cookie },
      cache: 'no-store',
    })

    if (!resp.ok) return null
    const data = await resp.json().catch(() => null)
    if (!data?.userId || !data?.role) return null
    return data as SessionInfo
  } catch {
    // Fail-safe for hosting environments where internal fetch can intermittently fail.
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = await getSessionInfo(request)

  if (pathname === '/' || pathname === '/login') {
    if (!session) return NextResponse.next()
    return NextResponse.redirect(new URL(roleHome(session.role), request.url))
  }

  if (!session) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (pathname.startsWith('/sim') && session.role !== 'Student') {
    return NextResponse.redirect(new URL(roleHome(session.role), request.url))
  }

  if (pathname.startsWith('/config') && session.role !== 'Instructor' && session.role !== 'Administrator') {
    return NextResponse.redirect(new URL(roleHome(session.role), request.url))
  }

  if (pathname.startsWith('/admin') && session.role !== 'Administrator') {
    return NextResponse.redirect(new URL(roleHome(session.role), request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/login', '/sim/:path*', '/config/:path*', '/admin/:path*'],
}
