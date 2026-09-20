import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import {makeHandler} from './handler.js';
Deno.serve(makeHandler(async (authorization:string)=>{
 // User-scoped client only: no service role and no client-supplied role.
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser();if(error||!data.user)return null;
 const member=await db.from('fraid_v2_people').select('id,role,active').eq('user_id',data.user.id).eq('active',true).maybeSingle();
 if(member.error||!member.data||!['admin','employee'].includes(member.data.role))return null;
 return member.data;
}));
