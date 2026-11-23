const crypto = require('node:crypto');
const base = '/.netlify/functions/auth';
const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const headers = {'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
function sign(data, key) { const body=Buffer.from(JSON.stringify(data)).toString('base64url');return body+'.'+crypto.createHmac('sha256',key).update(body).digest('base64url'); }
function verify(token,key) {try {const [body,sig]=token.split('.');const expected=crypto.createHmac('sha256',key).update(body).digest();const actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;const data=JSON.parse(Buffer.from(body,'base64url'));return data.exp>Date.now()?data:null;}catch{return null;} }
exports.handler = async event => {
  const env=process.env, missing=['SITE_URL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SESSION_SECRET'].filter(k=>!env[k]);
  const action=event.path.split('/').pop();
  const reply=(statusCode,data,cookies=[])=>({statusCode,headers,multiValueHeaders:{'Set-Cookie':cookies},body:JSON.stringify(data)});
  let origin;
  try {const u=new URL(env.SITE_URL);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin;}catch{if(!missing.includes('SITE_URL'))missing.push('SITE_URL (HTTPS origin only)');}
  if(env.SESSION_SECRET&&env.SESSION_SECRET.length<32)missing.push('SESSION_SECRET (at least 32 characters)');
  const cookies=Object.fromEntries((event.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
  const redirect=(url,values=[])=>({statusCode:302,headers:{...headers,Location:url},multiValueHeaders:{'Set-Cookie':values},body:''});
  if(action==='session')return reply(200,{user:missing.length?null:verify(cookies.session||'',env.SESSION_SECRET)?.user||null,missing,origin:origin||null,callback:origin?origin+base+'/callback':null});
  if(missing.length)return reply(503,{error:'ยังตั้งค่า Google ไม่ครบ กรุณาดู SETUP.md',missing});
  if(action==='logout') {
    if(event.httpMethod!=='POST'||event.headers.origin!==origin)return reply(403,{error:'คำขอออกจากระบบไม่ถูกต้อง'});
    return reply(200,{ok:true},[cookie('session','',0)]);
  }
  const callback=origin+base+'/callback';
  if(action==='start') {
    const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(32).toString('base64url');
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:'code',scope:'openid email profile',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    return redirect(url.href,[cookie('oauth',sign({state,verifier,exp:Date.now()+600000},env.SESSION_SECRET),600)]);
  }
  if(action==='callback') {
    const q=event.queryStringParameters||{},pending=verify(cookies.oauth||'',env.SESSION_SECRET),clear=cookie('oauth','',0);
    const fail=code=>redirect(origin+'/?auth_error='+code,[clear]);
    if(!pending||!q.state||pending.state!==q.state)return fail('state');
    if(q.error)return fail('denied');
    if(!q.code)return fail('code');
    try {
      const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({code:q.code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:callback,grant_type:'authorization_code',code_verifier:pending.verifier})});
      const token=await tokenResponse.json();if(!tokenResponse.ok||!token.access_token)throw Error();
      const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});
      const profile=await profileResponse.json();if(!profileResponse.ok||!profile.sub||!profile.email_verified)throw Error();
      const user={id:profile.sub,name:profile.name||profile.email,email:profile.email};
      return redirect(origin+'/?signed_in=1',[clear,cookie('session',sign({user,exp:Date.now()+86400000},env.SESSION_SECRET),86400)]);
    }catch{return fail('provider');}
  }
  return reply(404,{error:'ไม่พบเส้นทาง'});
};
