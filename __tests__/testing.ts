import { beforeEach } from '@jest/globals'
import { MockContext, Context, createMockContext } from './context'

let mockCtx: MockContext
let ctx: Context

beforeEach(() => {
  mockCtx = createMockContext()
  ctx = mockCtx as unknown as Context
})