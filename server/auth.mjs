import {createRemoteJWKSet,jwtVerify} from 'jose';

// Cache only public verification keys, never request identity or session data.
const keySets=new Map();
export async function verifyAccessToken(token,{issuer,audience},keys){
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'')||!audience)throw Error('身份服务未配置');
  if(!keys){
    if(!keySets.has(issuer))keySets.set(issuer,createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
    keys=keySets.get(issuer);
  }
  const {payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256'],requiredClaims:['exp','iat','sub'],clockTolerance:5});
  if(typeof payload.sub!=='string'||!payload.sub||payload.type!=='app')throw Error('无效玩家身份');
  return payload.sub;
}
export async function authenticatedOwner(request,env){
  const token=request.headers.get('cf-access-jwt-assertion')||request.headers.get('cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if(!token)return null;
  try{return await verifyAccessToken(token,{issuer:env.ACCESS_ISSUER,audience:env.ACCESS_AUD});}catch{return null;}
}
