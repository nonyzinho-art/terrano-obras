import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("",{headers});
 if(req.method!=="POST") return new Response(JSON.stringify({error:"Método inválido"}),{status:405,headers});
 try {
  if(Number(req.headers.get("content-length") || 0)>2048) throw Error("Solicitação inválida");
  const raw=await req.text(); if(raw.length>2048) throw Error("Solicitação inválida");
  const {token}=JSON.parse(raw);
  if(typeof token!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) throw Error("Convite inválido");
  const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data,error}=await client.rpc("supplier_quote",{p_token:token});
  if(error) return new Response(JSON.stringify({error:"Convite inválido ou encerrado."}),{status:403,headers});
  const documents=await Promise.all(data.documents.map(async(d:{id:string,title:string,filename:string,storage_path:string})=>{
   const signed=await client.storage.from("work-documents").createSignedUrl(d.storage_path,600,{download:d.filename});
   if(signed.error) return {id:d.id,title:d.title,filename:d.filename,url:null};
   return {id:d.id,title:d.title,filename:d.filename,url:signed.data.signedUrl};
  }));
  return new Response(JSON.stringify({...data,documents}),{headers});
 } catch {return new Response(JSON.stringify({error:"Não foi possível abrir o convite."}),{status:400,headers});}
});
