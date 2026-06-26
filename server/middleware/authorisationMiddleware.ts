import type { RequestHandler } from 'express'

// Paths that should never be stored as returnTo — background browser probes and static assets
// that are not real page navigations. Without this, e.g. Chrome's automatic DevTools workspace
// discovery request (/.well-known/appspecific/com.chrome.devtools.json) can race an
// unauthenticated request and end up as the returnTo destination after login.
const NON_NAVIGABLE_PATH = /^\/(\.well-known\/|assets\/)/

export default function authorisationMiddleware(): RequestHandler {
  return (req, res, next) => {
    if (!res.locals?.user?.token) {
      req.session.returnTo = NON_NAVIGABLE_PATH.test(req.originalUrl) ? '/' : req.originalUrl
      return res.redirect('/sign-in')
    }
    return next()
  }
}
