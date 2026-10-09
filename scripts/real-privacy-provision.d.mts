import type {PrismaClient} from '../apps/api/src/generated/prisma/client.js'
export function provisionPrivacyRole(admin:PrismaClient,role:string,password:string,expectedAdminRole?:string):Promise<void>
