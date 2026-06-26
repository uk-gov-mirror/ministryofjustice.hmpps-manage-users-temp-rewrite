import express from 'express'

import createError from 'http-errors'

import nunjucksSetup from './utils/nunjucksSetup'
import errorHandler from './errorHandler'
import authorisationMiddleware from './middleware/authorisationMiddleware'

import setUpAuthentication from './middleware/setUpAuthentication'
import setUpCsrf from './middleware/setUpCsrf'
import setUpCurrentUser from './middleware/setUpCurrentUser'
import setUpHealthChecks from './middleware/setUpHealthChecks'
import setUpStaticResources from './middleware/setUpStaticResources'
import setUpWebRequestParsing from './middleware/setUpRequestParsing'
import setUpWebSecurity from './middleware/setUpWebSecurity'
import setUpWebSession from './middleware/setUpWebSession'
import configureDebugRoutes from './routes/debug'

import routes from './routes'
import type { Services } from './services'

export default function createApp(services: Services): express.Application {
  const app = express()

  app.set('json spaces', 2)
  app.set('trust proxy', true)
  app.set('port', process.env.PORT || 3000)

  app.use(setUpHealthChecks(services.applicationInfo))
  app.use(setUpWebSecurity())
  app.use(setUpWebSession())
  app.use(setUpWebRequestParsing())
  app.use(setUpStaticResources())
  nunjucksSetup(app)

  // SECURITY WARNING: Debug routes are registered here, before setUpAuthentication, so they are
  // accessible without authentication. They are only registered when NODE_ENV !== 'production'.
  // See server/routes/debug/index.ts for full security notes.
  if (process.env.NODE_ENV !== 'production') {
    configureDebugRoutes(app)
  }

  // Silently 404 Chrome DevTools workspace background probe before they reach
  // authentication middleware and generate spurious token verification calls and ERROR logs.
  app.use('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => res.sendStatus(404))

  app.use(setUpAuthentication())
  app.use(authorisationMiddleware())
  app.use(setUpCsrf())
  app.use(setUpCurrentUser())
  // Expose query parameters to Nunjucks templates via res.locals.query.
  // For local development only — allows templates to branch on query params (e.g. for debug views).
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      res.locals.query = req.query
      next()
    })
  }

  app.use(routes(services))

  app.use((_req, _res, next) => next(createError(404, 'Not found')))
  app.use(errorHandler(process.env.NODE_ENV === 'production'))

  return app
}
