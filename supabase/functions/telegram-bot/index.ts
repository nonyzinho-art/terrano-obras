import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const url = Deno.env.get("SUPABASE_URL")!;
const roleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? (botToken ? await hash("Terrano webhook " + botToken) : undefined);
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const response = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
async function hash(value:string) {
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
async function send(chat:number,text:string,replyMarkup:unknown={remove_keyboard:true}) {
 const result=await fetch("https://api.telegram.org/bot"+botToken+"/sendMessage",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chat,text:text.slice(0,4000),reply_markup:replyMarkup})
 });
 const payload=await result.json();
 if(!result.ok || !payload.ok) throw new Error("Falha na entrega ao Telegram");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response(null,{headers:cors});
 if(req.method!=="POST") return response({error:"Método inválido"},405);
 try {
  const body=await req.json();
  const admin=createClient(url,roleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  if(body.action==="link" || body.action==="configure") {
   const auth=req.headers.get("Authorization") ?? "";
   if(!auth.startsWith("Bearer ")) return response({error:"Entre na sua conta"},401);
   const {data,error}=await admin.auth.getUser(auth.slice(7));
   if(error || !data.user) return response({error:"Sessão inválida"},401);
   const {data:profile,error:profileError}=await admin.from("app_profiles").select("role,active").eq("user_id",data.user.id).maybeSingle();
   if(profileError || !profile?.active) return response({error:"Acesso não liberado pelo administrador"},403);
   if(!botToken || !webhookSecret) return response({error:"O bot aguarda a configuração segura do token."},503);
   if(body.action==="configure") {
    if(profile.role!=="administrador" || !data.user.email_confirmed_at)
     return response({error:"Somente o administrador confirmado pode ativar o bot."},403);
    const call=async(method:string,params:unknown={})=>{
     const res=await fetch("https://api.telegram.org/bot"+botToken+"/"+method,{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(params)});
     const json=await res.json();
     if(!res.ok || !json.ok) throw new Error("Falha ao configurar o Telegram");
     return json.result;
    };
    const me=await call("getMe");
    if(me.username?.toLowerCase()!=="kanteiro_bot") return response({error:"O token não pertence ao @Kanteiro_bot."},400);
    const target=url+"/functions/v1/telegram-bot";
    const current=await call("getWebhookInfo");
    if(current.url && current.url!==target) return response({error:"O bot já está conectado a outro sistema. A troca precisa ser revisada antes da ativação."},409);
    await call("setWebhook",{url:target,secret_token:webhookSecret,allowed_updates:["message"],drop_pending_updates:false});
    const status=await call("getWebhookInfo");
    if(status.url!==target) throw new Error("Não foi possível confirmar a conexão");
    return response({configured:true});
   }
   const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,"0")).join("");
   const {error:insertError}=await admin.from("telegram_link_codes").insert({token_hash:await hash(token),user_id:data.user.id,expires_at:new Date(Date.now()+600000).toISOString()});
   if(insertError) throw new Error("Falha na geração do vínculo");
   return response({url:"https://t.me/Kanteiro_bot?start="+token});
  }
  // Telegram has no Supabase JWT. Authenticate its secret header instead.
  const supplied=req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if(!webhookSecret || !supplied || await hash(supplied)!==await hash(webhookSecret)) return response({error:"Não autorizado"},401);
  if(!botToken) return response({error:"Configuração pendente"},503);
  if(!Number.isSafeInteger(body.update_id)) return response({error:"Atualização inválida"},400);
  const m=body.message;
  // Work information is sent only in a private conversation with the linked user.
  if(!m || m.chat?.type!=="private" || !Number.isSafeInteger(m.from?.id) || m.from.id!==m.chat.id) return response({ok:true});
  const hasPhoto=Array.isArray(m.photo) && m.photo.length>0;
  const text=typeof m.text==="string" ? m.text.trim() : typeof m.caption==="string" ? m.caption.trim() : "";
  const start=text.match(/^\/start(?:@Kanteiro_bot)?\s+([a-f0-9]{48})$/i);
  if(start) {
   const {data,error}=await admin.rpc("consume_telegram_link",{p_hash:await hash(start[1]),p_telegram_id:m.from.id});
   if(error) throw new Error("Falha na vinculação");
   await send(m.chat.id,data ? "Conta vinculada ao Terrano Obras. Use /obras para consultar suas obras." : "Este vínculo expirou ou já foi utilizado. Gere outro no Terrano Obras.");
   return response({ok:true});
  }
  const {data:account,error:accountError}=await admin.from("telegram_accounts").select("user_id").eq("telegram_user_id",m.from.id).maybeSingle();
  if(accountError) throw new Error("Falha ao consultar conta");
  if(!account) {
   await send(m.chat.id,"Entre no Terrano Obras e clique em Vincular Telegram para conectar sua conta.");
   return response({ok:true});
  }
  async function availableWorks(writable=false) {
   const {data,error}=await admin.rpc("telegram_allowed_works",{p_telegram:m.from.id,p_write:writable});
   if(error) throw new Error("Falha ao consultar obras");
   return data ?? [];
  }
  const {data:session,error:sessionError}=await admin.from("telegram_conversations").select("*").eq("telegram_user_id",m.from.id).eq("user_id",account.user_id).maybeSingle();
  if(sessionError) throw new Error("Falha ao consultar conversa");
  if(session && !hasPhoto && body.update_id<=session.last_update) return response({ok:true});
  async function setConversation(stage:string,options:unknown[],work:string|null,budget:string|null=null) {
   const {data,error}=await admin.rpc("telegram_budget_choose",{p_telegram:m.from.id,p_user:account.user_id,p_stage:stage,p_options:options,p_work:work,p_budget:budget,p_update:body.update_id});
   if(error) throw new Error("Falha ao atualizar conversa");
   return data;
  }
  type Choice = {id:string;name:string;workName?:string};
  const buttons=(options:Choice[])=>({keyboard:options.map((w,i)=>[{text:(i+1)+". "+w.name}]).concat([[{text:"/cancelar"}]]),resize_keyboard:true,one_time_keyboard:true});
  function selected(options:Choice[]) {
   if(hasPhoto) return undefined;
   const index=/^\d+$/.test(text) ? Number(text)-1 : options.findIndex((w,i)=>text===(i+1)+". "+w.name);
   return Number.isSafeInteger(index) && index>=0 ? options[index] : undefined;
  }
  async function askWork() {
   const works=await availableWorks(true);
   if(!works.length) {
    await setConversation("done",[],null);
    await send(m.chat.id,"Nenhuma obra em andamento liberada para registro. Cadastre uma obra ou solicite acesso.");
   } else if(await setConversation("choose_work",works,null)) {
    await send(m.chat.id,"Vamos registrar seu diário. Escolha a obra em andamento:\n\n"+works.map((w,i)=>(i+1)+". "+w.name).join("\n")+"\n\nToque no botão da obra ou responda com o número.",buttons(works));
   }
  }
  async function askBudget(work:Choice) {
   const {data,error}=await admin.rpc("telegram_budgets",{p_telegram:m.from.id,p_work:work.id});
   if(error) {await send(m.chat.id,"Esta obra não está liberada. Envie /diario para escolher novamente.");return;}
   const budgets=(data ?? []).map((f:Choice)=>({...f,workName:work.name}));
   if(!budgets.length) {await send(m.chat.id,"Esta obra está sem orçamentos aprovados em execução. Consulte o responsável antes de registrar.");return;}
   if(await setConversation("choose_budget",budgets,work.id))
    await send(m.chat.id,"Obra: "+work.name+"\nEscolha o orçamento aprovado em execução:\n\n"+budgets.map((f:Choice,i:number)=>(i+1)+". "+f.name).join("\n")+"\n\nToque no botão do orçamento ou responda com o número.",buttons(budgets));
  }
  if(/^\/cancelar(?:@Kanteiro_bot)?$/i.test(text)) {
   if(await setConversation("done",[],null)) await send(m.chat.id,"Registro cancelado. Envie /diario quando quiser começar novamente.");
   return response({ok:true});
  }
  if(/^\/obras(?:@Kanteiro_bot)?$/i.test(text)) {
   const works=await availableWorks();
   await send(m.chat.id,works.length ? works.map((w,i)=>(i+1)+". "+w.name).join("\n")+"\n\nPara registrar fotos da obra, envie /diario." : "Nenhuma obra cadastrada para sua conta. Cadastre sua primeira obra no Terrano Obras.");
   return response({ok:true});
  }
  if(/^\/(?:diario|start)(?:@Kanteiro_bot)?$/i.test(text) || /^\/diario(?:@Kanteiro_bot)?\s/i.test(text)) {
   await askWork();return response({ok:true});
  }
  const active=session && session.stage!=="done" && Date.parse(session.expires_at)>Date.now();
  if(active && session.stage==="choose_work") {
   const work=selected(session.options as Choice[]);
   if(!work) {await send(m.chat.id,"Escolha uma obra pelos botões ou responda com o número.",buttons(session.options));return response({ok:true});}
   await askBudget(work);return response({ok:true});
  }
  if(active && session.stage==="choose_budget") {
   const budget=selected(session.options as Choice[]);
   if(!budget) {await send(m.chat.id,"Escolha um orçamento pelos botões ou responda com o número.",buttons(session.options));return response({ok:true});}
   if(await setConversation("observation",session.options,session.work_id,budget.id))
    await send(m.chat.id,"Registro: "+budget.workName+" → "+budget.name+"\n\nEnvie agora uma ou várias fotos. A legenda é opcional.\nEnvie /concluir quando terminar ou /cancelar para sair.",{keyboard:[[{text:"/concluir"},{text:"/cancelar"}]],resize_keyboard:true});
   return response({ok:true});
  }
  if(/^\/concluir(?:@Kanteiro_bot)?$/i.test(text)) {
   if(await setConversation("done",[],null)) await send(m.chat.id,"Envio encerrado. As fotos já recebidas estão salvas no diário. No site, clique em Atualizar para consultar. Para outro registro, envie /diario.");
   return response({ok:true});
  }
  if(active && session.stage==="observation" && (hasPhoto || !text.startsWith("/"))) {
   if(!session.budget_id) {await askWork();return response({ok:true});}
   if(!hasPhoto && !text) {await send(m.chat.id,"Envie a imagem como foto pelo Telegram, com legenda opcional.");return response({ok:true});}
   if(text.length>5000) {await send(m.chat.id,"Use uma legenda com até 5.000 caracteres.");return response({ok:true});}
   // Retry acknowledgments without downloading or overwriting an already saved object.
   const {data:existing,error:existingError}=await admin.from("telegram_updates").select("report_id").eq("update_id",body.update_id).maybeSingle();
   if(existingError) throw new Error("Falha ao conferir envio");
   if(existing) return response({ok:true});
   let path:string|null=null;
   if(hasPhoto) {
    const permitted=await availableWorks(true);
    if(!permitted.some(w=>w.id===session.work_id)) {await send(m.chat.id,"Esta obra não está liberada para sua conta. Envie /diario para escolher novamente.");return response({ok:true});}
    const photo=m.photo[m.photo.length-1];
    if(photo.file_size>10*1024*1024) {await send(m.chat.id,"Envie uma foto com até 10 MB.");return response({ok:true});}
    const res=await fetch("https://api.telegram.org/bot"+botToken+"/getFile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file_id:photo.file_id})});
    const info=await res.json();
    const filePath=info.result?.file_path;
    if(!res.ok || !info.ok || typeof filePath!=="string" || !/^[a-zA-Z0-9_./-]+$/.test(filePath) || filePath.includes("..")) throw new Error("Falha ao localizar foto");
    const download=await fetch("https://api.telegram.org/file/bot"+botToken+"/"+filePath);
    if(!download.ok) throw new Error("Falha ao baixar foto");
    const bytes=new Uint8Array(await download.arrayBuffer());
    if(bytes.length>10*1024*1024 || bytes[0]!==255 || bytes[1]!==216) {await send(m.chat.id,"Não consegui ler essa imagem. Envie novamente como foto pelo Telegram.");return response({ok:true});}
    path=session.work_id+"/telegram/"+body.update_id+".jpg";
    const {error:uploadError}=await admin.storage.from("diary-photos").upload(path,bytes,{contentType:"image/jpeg",upsert:true});
    if(uploadError) throw new Error("Falha ao guardar foto");
   }
   const {data,error}=await admin.rpc("telegram_diary_append_budget",{p_update:body.update_id,p_telegram:m.from.id,p_text:text,p_path:path,p_work:session.work_id,p_budget:session.budget_id});
   if(error) {await send(m.chat.id,"Não consegui vincular este envio ao diário. Envie /diario para escolher a obra e tente novamente.");return response({ok:true});}
   const budget=(session.options as Choice[]).find(f=>f.id===session.budget_id);
   const name=budget?.workName ?? "sua obra";
   const budgetName=budget?.name ?? "seu orçamento";
   const today=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(new Date());
   await send(m.chat.id,(hasPhoto ? "Foto salva!" : "Texto salvo!")+"\n"+name+" → "+budgetName+" → "+today+"\n\nPode enviar mais fotos para este mesmo diário. Quando terminar, envie /concluir.\nNo site, clique em Atualizar e abra o dia de hoje no calendário.");
   return response({ok:true});
  }
  await send(m.chat.id,"Para registrar fotos da obra, envie /diario. Escolha a obra, o orçamento e envie suas fotos com legenda opcional.\n\n/obras — consultar suas obras\n/cancelar — cancelar um registro");
  return response({ok:true});
 } catch {
  // Never log credentials, link codes, message bodies or token-bearing URLs.
  return response({error:"Falha temporária no processamento"},500);
 }
});


