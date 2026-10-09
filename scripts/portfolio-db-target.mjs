/** This increment has its own new loopback database; no existing target guard is relaxed. */
export function portfolioTestTarget(env){
 let target;try{target=new URL(env.DATABASE_URL??'')}catch{throw Error('NOT TESTED: explicit portfolio synthetic database missing')}
 if(env.FINNTECH_PORTFOLIO_TEST!=='synthetic-only'||target.protocol!=='postgresql:'||target.hostname!=='127.0.0.1'||target.port!=='5448'||target.pathname!=='/finntech_portfolio_test'||target.username!=='portfolio_synthetic'||!target.password||target.search||target.hash)throw Error('Refused non-portfolio synthetic target')
 return target
}
