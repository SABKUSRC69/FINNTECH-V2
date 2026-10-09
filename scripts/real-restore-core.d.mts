import type {PrismaClient} from '../apps/api/src/generated/prisma/client.js'
import type {AuthConfiguration} from '../apps/api/src/auth/config.js'
export function rebindRestoredDatabase(db:PrismaClient,config:AuthConfiguration,dataset:string,digest:string):Promise<void>
