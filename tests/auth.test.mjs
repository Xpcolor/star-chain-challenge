import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyAccessToken} from '../server/auth.mjs';
import worker,{api} from '../server/worker.mjs';
const config={issuer:'https://star-chain-test.cloudflareaccess.com',audience:'test-audience'};
test('Access verifies signature, expiry, issuer, audience and human subject',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const sign=(claims={},key=privateKey)=>new SignJWT({type:'app',...claims}).setProtectedHeader({alg:'RS256'}).setSubject('alice').setIssuer(config.issuer).setAudience(config.audience).setIssuedAt().setExpirationTime('5m').sign(key);
  assert.equal(await verifyAccessToken(await sign(),config,publicKey),'alice');
  await assert.rejects(verifyAccessToken(await sign(),{...config,audience:'wrong'},publicKey));
  await assert.rejects(verifyAccessToken(await sign(),{...config,issuer:'https://other.cloudflareaccess.com'},publicKey));
  await assert.rejects(verifyAccessToken(await sign({type:'service'}),config,publicKey));
  const expired=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256'}).setSubject('alice').setIssuer(config.issuer).setAudience(config.audience).setIssuedAt(1).setExpirationTime(2).sign(privateKey);
  await assert.rejects(verifyAccessToken(expired,config,publicKey));
  const other=await generateKeyPair('RS256');await assert.rejects(verifyAccessToken(await sign({},other.privateKey),config,publicKey));
});
test('public Worker rejects legacy identity headers and unsigned JWTs; account race blocks writes',async()=>{
  for(const headers of [{'oai-authenticated-user-id':'alice'},{'cf-access-authenticated-user-email':'alice@example.com'},{'cf-access-jwt-assertion':'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhbGljZSJ9.'}]){
    assert.equal((await worker.fetch(new Request('https://game.example/api/profile',{headers}),{ACCESS_ISSUER:config.issuer,ACCESS_AUD:config.audience})).status,401);
  }
  const response=await api(new Request('https://game.example/api/records/example-id',{method:'PUT',headers:{'x-star-chain-owner':'alice'},body:'{}'}),{ENVIRONMENT:'production'},'bob');
  assert.equal(response.status,409);
});
