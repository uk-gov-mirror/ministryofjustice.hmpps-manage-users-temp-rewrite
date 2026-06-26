import session, { MemoryStore, Store } from 'express-session'
import { RedisStore } from 'connect-redis'
import express, { Router } from 'express'
import { randomUUID } from 'crypto'
import { createRedisClient } from '../data/redisClient'
import config from '../config'
import logger from '../../logger'

export const SESSION_COOKIE_NAME = 'hmpps-manage-users-temp-rewrite.session'

// Exported so debug routes can call store.all() to list all active sessions.
// Only populated after setUpWebSession() has been called.
export const sessionStoreRef: { store: Store | null } = { store: null }

export default function setUpWebSession(): Router {
  let store: Store
  if (config.redis.enabled) {
    const client = createRedisClient()
    client.connect().catch((err: Error) => logger.error(`Error connecting to Redis`, err))
    store = new RedisStore({ client })
  } else {
    store = new MemoryStore()
  }
  sessionStoreRef.store = store

  const router = express.Router()
  router.use(
    session({
      store,
      name: SESSION_COOKIE_NAME,
      cookie: { secure: config.https, sameSite: 'lax', maxAge: config.session.expiryMinutes * 60 * 1000 },
      secret: config.session.secret,
      resave: false, // redis implements touch so shouldn't need this
      saveUninitialized: false,
      rolling: true,
    }),
  )

  router.use((req, res, next) => {
    const headerName = 'X-Request-Id'
    const oldValue = req.get(headerName)
    const id = oldValue === undefined ? randomUUID() : oldValue

    res.set(headerName, id)
    req.id = id

    next()
  })

  return router
}
