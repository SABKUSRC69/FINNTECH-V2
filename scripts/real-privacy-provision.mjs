// Explicit operator provisioning: no web endpoint, no shared application credential.
export async function provisionPrivacyRole(admin,role,password,expectedAdminRole) {
  if(!/^[a-z][a-z0-9_]{1,62}$/.test(role)||typeof password!=='string'||password.length<32||password.length>256)throw new Error('OPERATOR_CONFIGURATION_REJECTED')
  const marker=await admin.runtimeBoundary.findUniqueOrThrow({where:{id:'singleton'}})
  const identity=await admin.$queryRaw`SELECT current_user AS role,current_database() AS name`
  const adminRole=expectedAdminRole??marker.databaseRole
  if(!['real','real-rehearsal'].includes(marker.mode)||role===marker.databaseRole||role===adminRole||identity[0]?.role!==adminRole
    ||(adminRole!==marker.databaseRole&&identity[0]?.name===marker.databaseName))throw new Error('ADMIN_BOUNDARY_REJECTED')
  await admin.$transaction(async tx=>{
    const exists=await tx.$queryRaw`SELECT rolname FROM pg_roles WHERE rolname=${role}`
    if(exists.length)throw new Error('EXISTING_ROLE_NOT_MODIFIED')
    await tx.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password.replaceAll("'","''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`)
    await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`)
    await tx.$executeRawUnsafe(`GRANT SELECT ON runtime_boundaries,account_deletion_cases TO "${role}"`)
    for(const signature of ['tracker_case_archive(UUID,TEXT,TEXT,TEXT)','tracker_purge_owner_case(UUID)','tracker_replay_deletion(UUID,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT)','tracker_record_restore(UUID,TEXT)'])
      await tx.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION ${signature} TO "${role}"`)
    await tx.$executeRaw`INSERT INTO privacy_operators(role_name) VALUES(${role}) ON CONFLICT DO NOTHING`
  })
}

if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
  let admin
  try{
    const {readAuthConfiguration}=await import('../apps/api/dist/auth/config.js')
    const {createTrackerDatabase}=await import('../apps/api/dist/persistence/database.js')
    const config=readAuthConfiguration(process.env),operator=new URL(process.env.FINNTECH_PRIVACY_DATABASE_URL??'')
    if(config?.real?.boundary!=='real'||config.real.registrationsOpen||process.env.FINNTECH_PRIVACY_PROVISION_CONFIRM!=='new-operator-only'||operator.hostname!==new URL(config.databaseUrl).hostname||operator.pathname!==`/${config.real.databaseName}`)throw Error()
    admin=createTrackerDatabase(config.databaseUrl)
    await provisionPrivacyRole(admin,decodeURIComponent(operator.username),decodeURIComponent(operator.password),config.real.databaseRole)
    console.log('PASS: distinct restricted operator provisioned; no accounts deleted')
  }catch{console.error('FAIL: operator provisioning refused; existing roles unchanged; details withheld');process.exitCode=1}
  finally{await admin?.$disconnect()}
}
