import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { createDb } from '#/db'
import { loadCalculatorCatalog } from './calculator'

export const getCalculatorCatalog = createServerFn().handler(() =>
  loadCalculatorCatalog(createDb(env.DB)),
)
