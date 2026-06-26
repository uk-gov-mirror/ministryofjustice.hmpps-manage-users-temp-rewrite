// SECURITY WARNING: This file registers unauthenticated debug routes.
// These routes are only registered when NODE_ENV !== 'production' (i.e. locally).
// They are registered BEFORE passport/setUpAuthentication, meaning they are
// accessible to ANY request with no authentication required.
// They expose sensitive data for ALL active sessions including JWT access tokens,
// session IDs, CSRF tokens, and cookie signatures. Do not enable in any shared environment.
//
// NOTE: cdnjs.cloudflare.com is added to scriptSrc/styleSrc in setUpWebSecurity.ts
// to support highlight.js on this page. This CSP change is gated behind !config.production
// so it does not apply in deployed environments.

import { Application, Request, Response } from 'express'
import { jwtDecode } from 'jwt-decode'
import config from '../../config'
import { sessionStoreRef, SESSION_COOKIE_NAME } from '../../middleware/setUpWebSession'

export default function configureDebugRoutes(app: Application): void {
  app.get('/debug/session', (req: Request, res: Response) => {
    // Token is read directly from the session since this route runs before setUpAuthentication,
    // so res.locals.user is not yet populated. passport stores { token, username, authSource }
    // in req.session.passport.user, but this is an internal passport implementation detail
    // not exposed in its public TypeScript types — hence the cast to any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawToken = (req.session as any)?.passport?.user?.token ?? null
    const decodedToken = rawToken ? jwtDecode(rawToken) : null

    const rawCookies = req.headers.cookie || ''
    const rawCookie =
      rawCookies
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? null
    const rawCookieValue = rawCookie ? rawCookie.slice(SESSION_COOKIE_NAME.length + 1) : null
    // raw format is s:SESSION_ID.SIGNATURE (URL-encoded)
    const decodedCookieValue = rawCookieValue ? decodeURIComponent(rawCookieValue) : null
    const signatureSep = decodedCookieValue ? decodedCookieValue.indexOf('.') : -1
    const signature = signatureSep !== -1 ? decodedCookieValue.slice(signatureSep + 1) : null

    const sessionCookie = {
      name: SESSION_COOKIE_NAME,
      raw: rawCookieValue,
      decoded: {
        sessionId: req.sessionID,
        signature,
      },
    }

    sessionStoreRef.store.all((err, allSessions) => {
      // SECURITY WARNING: allSessions contains raw passport.user.token for every logged-in user.
      // These are NOT redacted. If REDIS_HOST points to a shared Redis instance, this will
      // expose real users' tokens to anyone who can reach this endpoint.
      res.json({
        decodedToken,
        sessionCookie,
        currentSession: req.session,
        locals: res.locals,
        usingRedis: config.redis.enabled,
        allSessions: err ? { error: (err as Error).message } : allSessions,
      })
    })
  })

  app.get('/debug/session/view', (_req: Request, res: Response) => {
    res.render('debug/session')
  })

  app.delete('/debug/session/all', (req: Request, res: Response) => {
    sessionStoreRef.store.clear(err => {
      if (err) {
        res.status(500).json({ error: (err as Error).message })
      } else {
        // Regenerate the current session so the caller still has a valid session
        // after clearing, rather than being left with a dangling session ID.
        req.session.regenerate(regenerateErr => {
          if (regenerateErr) {
            res.status(500).json({ error: (regenerateErr as Error).message })
          } else {
            res.json({ ok: true })
          }
        })
      }
    })
  })

  app.delete('/debug/session/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params
    sessionStoreRef.store.destroy(Array.isArray(sessionId) ? sessionId[0] : sessionId, err => {
      if (err) {
        res.status(500).json({ error: (err as Error).message })
      } else {
        res.json({ ok: true })
      }
    })
  })
}
