import { NextRequest, NextResponse } from 'next/server'

type SessionInfo = {
  userId?: string
  role?: 'Administrator' | 'Instructor' | 'Student'
}

const COOKIE_NAME = 'psim_session'

const normalizeRole = (role: string | undefined | null): 'Administrator' | 'Instructor' | 'Student' | undefined => {
  const raw = String(role || '').trim().toLowerCase()
  if (raw === 'administrator' || raw === 'admin') return 'Administrator'
  if (raw === 'instructor') return 'Instructor'
  if (raw === 'student') return 'Student'
  return undefined
}

const roleHome = (role?: string) => {
  const normalized = normalizeRole(role)
  if (normalized === 'Student') return '/sim'
  if (normalized === 'Instructor') return '/config'
  if (normalized === 'Administrator') return '/admin'
  return '/'
}

const decodeBase64UrlJson = (value: string): any | null => {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

const getSessionInfo = (request: NextRequest): SessionInfo | null => {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return null

  const [payloadB64] = token.split('.')
  if (!payloadB64) return null

  const payload = decodeBase64UrlJson(payloadB64)
  if (!payload?.userId) return null
  const role = normalizeRole(payload.role)
  if (!role) return null

  return { userId: String(payload.userId), role }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = getSessionInfo(request)

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
