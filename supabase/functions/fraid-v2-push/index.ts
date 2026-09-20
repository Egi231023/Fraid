// Supabase Edge Function: send-push
// Web Push bez externej Node knižnice - natívne cez Deno Web Crypto API.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://egi231023.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------- pomocné funkcie ----------

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// ---------- VAPID JWT ----------

async function importVapidPrivateKey(privB64: string, pubB64: string) {
  const d = b64urlToBytes(privB64);
  const pub = b64urlToBytes(pubB64); // 65 bajtov: 0x04 || X || Y
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: bytesToB64url(d),
    x: bytesToB64url(x),
    y: bytesToB64url(y),
    ext: true,
  };
  return await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
}

async function makeVapidJwt(audience: string, subject: string, privB64: string, pubB64: string) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const enc = new TextEncoder();
  const h = bytesToB64url(enc.encode(JSON.stringify(header)));
  const p = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${h}.${p}`;
  const key = await importVapidPrivateKey(privB64, pubB64);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned))
  );
  return `${unsigned}.${bytesToB64url(sig)}`;
}

// ---------- aes128gcm šifrovanie ----------

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8
  );
  return new Uint8Array(bits);
}

async function encryptPayload(payload: string, p256dhB64: string, authB64: string) {
  const enc = new TextEncoder();
  const clientPub = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  // efemérny ECDH pár
  const eph = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  ) as CryptoKeyPair;
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));

  const clientKey = await crypto.subtle.importKey(
    'raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, eph.privateKey, 256)
  );

  // PRK podľa RFC8291
  const authInfo = concat(enc.encode('WebPush: info\0'), clientPub, ephPubRaw);
  const ikm = await hkdf(authSecret, shared, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plaintext = concat(enc.encode(payload), new Uint8Array([0x02])); // padding delimiter
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext)
  );

  // hlavička: salt(16) | rs(4) | idlen(1) | keyid(65)
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const idlen = new Uint8Array([ephPubRaw.length]);
  return concat(salt, rs, idlen, ephPubRaw, ciphertext);
}

// ---------- odoslanie jednej notifikácie ----------

async function sendOne(sub: any, payload: string, vapidPub: string, vapidPriv: string) {
  const url = new URL(sub.endpoint);
  if (url.protocol !== 'https:' || !(url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' || url.hostname.endsWith('.push.apple.com'))) throw new Error('Unsupported push service');
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await makeVapidJwt(audience, 'mailto:admin@fraid.app', vapidPriv, vapidPub);
  const body = await encryptPayload(payload, sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapidPub}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body,
  });

  return { ok: res.ok, status: res.status, endpoint: sub.endpoint };
}


Deno.serve(async (req) => {
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try {
  const authorization=req.headers.get('Authorization')||'';
  const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}});
  const {data:{user},error:authError}=await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
  if(authError||!user)return json({error:'Prihlásenie je potrebné.'},401);
  const {data:member,error:memberError}=await userClient.from('fraid_v2_people').select('id,role').eq('user_id',user.id).eq('active',true).maybeSingle();
  if(memberError||!member)return json({error:'Prístup nie je schválený.'},403);
  const input=await req.json();
  const pub=Deno.env.get('VAPID_PUBLIC_KEY'),priv=Deno.env.get('VAPID_PRIVATE_KEY');
  if(!pub||!priv)return json({error:'Notifikácie zatiaľ nie sú nastavené.'},503);
  if(input.action==='key')return json({key:pub});
  if(input.action!=='send'||member.role!=='admin')return json({error:'Vyžaduje sa administrátor.'},403);
  const {data:note,error}=await userClient.from('fraid_v2_records').select('data').eq('kind','notes').eq('id',input.noteId).single();
  if(error||!note)return json({error:'Odkaz neexistuje.'},404);
  const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:active}=await service.from('fraid_v2_people').select('user_id').eq('active',true).not('user_id','is',null);
  const {data:subs,error:subError}=await service.from('fraid_v2_push').select('*').in('user_id',(active||[]).map(p=>p.user_id));
  if(subError)return json({error:'Notifikácie sa nepodarilo načítať.'},500);
  const payload=JSON.stringify({title:'Fraid · Odkaz pre tím',body:String(note.data.text).slice(0,250),url:'./',tag:'fraid-note-'+input.noteId});
  const results=await Promise.allSettled((subs||[]).map(s=>sendOne(s,payload,pub,priv)));
  return json({sent:results.filter(r=>r.status==='fulfilled'&&r.value.ok).length,total:subs?.length||0});
 } catch {return json({error:'Notifikácie sa nepodarilo odoslať.'},500);}
});

