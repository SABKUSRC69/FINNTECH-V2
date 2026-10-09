import {readFile,writeFile,rename,lstat,mkdir} from 'node:fs/promises'
import path from 'node:path'
export async function runBackupJob({directory,run,now=()=>new Date(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pointer}) {
  if(!path.isAbsolute(directory)||!path.isAbsolute(pointer)||path.dirname(pointer)!==directory)throw new Error('RUNNER_PATH_REJECTED')
  await mkdir(directory,{recursive:true});if((await lstat(directory)).isSymbolicLink())throw new Error('RUNNER_PATH_REJECTED')
  const file=path.join(directory,'.finntech-backup-job.json')
  const save=async value=>{const temporary=`${file}.${process.pid}.tmp`;await writeFile(temporary,JSON.stringify(value),{mode:0o600});await rename(temporary,file)}
  let job
  try {if((await lstat(file)).isSymbolicLink())throw Error();job=JSON.parse(await readFile(file,'utf8'))}catch(error){if(error.code!=='ENOENT')throw new Error('RUNNER_JOURNAL_REJECTED')}
  if(job?.phase==='DONE'&&now().getTime()-Date.parse(job.createdAt)<86400000&&now().getTime()>=Date.parse(job.createdAt))return {status:'NOT_DUE'}
  if(!job||job.phase==='DONE')job={version:1,phase:'DUMP',startedAt:now().toISOString(),failures:0}
  if(job.version!==1||!['DUMP','UPLOAD'].includes(job.phase)||!Number.isInteger(job.failures))throw new Error('RUNNER_JOURNAL_REJECTED')
  await save(job)
  for(let attempt=0;attempt<2;attempt++){
    try{
      if(job.phase==='DUMP'){
        // Reconcile a successfully written pointer after an interrupted dump process.
        let previous
        try{if((await lstat(pointer)).isSymbolicLink())throw new Error('RUNNER_PATH_REJECTED');previous=JSON.parse(await readFile(pointer,'utf8'))}catch(error){if(error.message==='RUNNER_PATH_REJECTED')throw error}
        if(!previous||!Number.isFinite(Date.parse(previous.createdAt))||Date.parse(previous.createdAt)<Date.parse(job.startedAt)) {
          if(await run('dump')!==0)throw Error('dump');previous=JSON.parse(await readFile(pointer,'utf8'))
        }
        if(previous.status!=='ENCRYPTED_AND_VERIFIED'||path.dirname(previous.archivePath)!==directory
          ||!/^\d{8}T\d{9}Z-[a-f0-9]{16}\.fnb$/.test(path.basename(previous.archivePath))
          ||!Number.isFinite(Date.parse(previous.createdAt))||Date.parse(previous.createdAt)<Date.parse(job.startedAt)||Date.parse(previous.createdAt)>now().getTime())throw Error('pointer')
        job={...job,phase:'UPLOAD',archivePath:previous.archivePath,createdAt:previous.createdAt};await save(job)
      }
      if(path.dirname(job.archivePath)!==directory||await run('upload',job.archivePath)!==0)throw Error('upload')
      await save({...job,phase:'DONE',completedAt:now().toISOString()})
      return {status:'DONE',createdAt:job.createdAt,retried:job.failures>0}
    }catch{
      job.failures++;await save({...job,lastFailureAt:now().toISOString()})
      if(attempt===0)await sleep(30000)
    }
  }
  // A status publication failure is itself handled by the independent missed-receipt watchdog.
  try{await run('failure')}catch{}
  return {status:'FAILED',phase:job.phase,originalArchiveRetained:true}
}
