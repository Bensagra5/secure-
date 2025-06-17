import { Context } from './context'

interface CreateUser {
  name: string
  email: string
  acceptTermsAndConditions: boolean
}

export async function createUser(user: CreateUser, ctx: Context) {
  if (user.email) {
    return await ctx.prisma.user.create({
      data: user,
    })
  } else {
    return new Error('User must accept terms!')
  }
}



