import type {PrismaClient} from '../apps/api/src/generated/prisma/client.js'
export interface DeletionRecord {caseId:string;datasetId:string;ownerId:string;userId:string;requestedAt:string}
export function sealDeletion(record:DeletionRecord,key:Buffer):Buffer
export function openDeletion(bytes:Buffer,key:Buffer,datasetId:string):DeletionRecord
export function sealRegistry(record:{datasetId:string;entries:{id:string;hash:string}[]},key:Buffer):Buffer
export function verifyPrivacyRegistry(drive:unknown,folder:string,key:Buffer,datasetId:string,anchorId:string):Promise<{record:{datasetId:string;entries:{id:string;hash:string}[]};etag:string|undefined}>
export function publishAndPurge(db:PrismaClient,drive:unknown,folder:string,key:Buffer,caseId:string,anchorId:string):Promise<{status:'PURGED';caseId:string;offDeviceReceipt:string}>
export function replayOffDeviceDeletions(db:PrismaClient,drive:unknown,folder:string,key:Buffer,anchorId:string):Promise<{status:'REPLAYED';cases:number;ledgerSha256:string;publicActivation:'NOT_AUTHORIZED'}>
