import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {INVALID,PHOTO_HELP,QUESTIONS,backKeyboard,confirmKeyboard,isBack,isConfirm,menuAction,menuKeyboard,missing,parseEquipment,parseWeather,parseWorkers,reminderKeyboard,reminderText,savedText,summaryText,weatherKeyboard,type Field,type Summary} from "./diary.ts";
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
  // 17:30 reminder, called by the database schedule with a key kept in the vault.
  if(body.action==="remind") {
   if(!botToken) return response({error:"Configuração pendente"},503);
   const {data,error}=await admin.rpc("telegram_reminder_list",{p_key:typeof body.key==="string" ? body.key : ""});
   if(error || !data) return response({error:"Não autorizado"},401);
   let sent=0;
   for(const person of data.people ?? []) {
    try {await send(person.telegram_user_id,reminderText(data.date,person.works),reminderKeyboard);sent++;} catch {/* blocked bot or deleted chat */}
   }
   return response({sent});
  }
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
  type Choice = {id:string;name:string;workName?:string;budgetId?:string;budgetName?:string};
  const today=()=>new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(new Date());
  const buttons=(options:Choice[])=>({keyboard:options.map((w,i)=>[{text:(i+1)+". "+w.name}]).concat([[{text:"/cancelar"}]]),resize_keyboard:true,one_time_keyboard:true});
  function selected(options:Choice[]) {
   if(hasPhoto) return undefined;
   const index=/^\d+$/.test(text) ? Number(text)-1 : options.findIndex((w,i)=>text===(i+1)+". "+w.name);
   return Number.isSafeInteger(index) && index>=0 ? options[index] : undefined;
  }
  // The last work and budget this person registered, if still open for the diary.
  async function lastChoice(works:Choice[]):Promise<Choice|undefined> {
   const {data}=await admin.from("daily_reports").select("work_id,budget_id").eq("created_by",account!.user_id).not("budget_id","is",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
   const work=data && works.find(w=>w.id===data.work_id);
   if(!work) return undefined;
   const {data:budgets,error}=await admin.rpc("telegram_budgets",{p_telegram:m.from.id,p_work:work.id});
   const budget=error ? undefined : (budgets ?? []).find((b:Choice)=>b.id===data.budget_id);
   return budget ? {id:work.id,name:"▶️ Continuar: "+work.name+" → "+budget.name,workName:work.name,budgetId:budget.id,budgetName:budget.name} : undefined;
  }
  async function askWork() {
   const works=await availableWorks(true);
   if(!works.length) {
    await setConversation("done",[],null);
    await send(m.chat.id,"Nenhuma obra em andamento liberada para registro. Cadastre uma obra ou solicite acesso.");
    return;
   }
   const last=await lastChoice(works);
   const options:Choice[]=last ? [last,...works] : works;
   if(await setConversation("choose_work",options,null)) {
    await send(m.chat.id,(last ? "Vamos registrar seu diário. Continue na última obra ou escolha outra:" : "Vamos registrar seu diário. Escolha a obra em andamento:")+"\n\n"+options.map((w,i)=>(i+1)+". "+w.name).join("\n")+"\n\nToque no botão ou responda com o número.",buttons(options));
   }
  }
  async function summary():Promise<Summary|null> {
   const {data,error}=await admin.rpc("telegram_diary_resume",{p_telegram:m.from.id});
   if(error) throw new Error("Falha ao consultar diário");
   return data;
  }
  async function enterDiary(work:{id:string;name:string},budget:{id:string;name:string}) {
   const choice={id:budget.id,name:budget.name,workName:work.name};
   if(!await setConversation("observation",[choice],work.id,budget.id)) return;
   const current=await summary();
   const place=work.name+" → "+budget.name;
   await send(m.chat.id,(current ? "Continuando o diário de hoje.\n\n"+summaryText(current,place,today()) : "Diário de hoje: "+place)+
    "\n\nEnvie fotos (com legenda opcional) ou textos de observação a qualquer momento. Use os botões para clima, efetivo, equipamentos e ocorrências. Quando terminar, toque em Finalizar diário.",menuKeyboard);
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
   if(work.budgetId) {await enterDiary({id:work.id,name:work.workName ?? work.name},{id:work.budgetId,name:work.budgetName ?? ""});return response({ok:true});}
   await askBudget(work);return response({ok:true});
  }
  if(active && session.stage==="choose_budget") {
   const budget=selected(session.options as Choice[]);
   if(!budget) {await send(m.chat.id,"Escolha um orçamento pelos botões ou responda com o número.",buttons(session.options));return response({ok:true});}
   await enterDiary({id:session.work_id,name:budget.workName ?? ""},budget);
   return response({ok:true});
  }
  const action=hasPhoto ? undefined : menuAction(text);
  if(action==="later") {
   if(await setConversation("done",[],null)) await send(m.chat.id,"Rascunho guardado. O que você enviou já está no diário de hoje; para continuar, envie /diario e toque em Continuar. No site, clique em Atualizar para consultar.");
   return response({ok:true});
  }
  if(action && !active) {await send(m.chat.id,"Este registro expirou. Envie /diario e toque em Continuar.");return response({ok:true});}
  if(active && session.stage==="observation" && !hasPhoto) {
   const current=(session.options as Choice[]).find(f=>f.id===session.budget_id);
   const place=(current?.workName ?? "Obra")+" → "+(current?.name ?? "orçamento");
   const ask=async(field:Field|null,message:string,keyboard:unknown)=>{
    const {data,error}=await admin.rpc("telegram_diary_await",{p_telegram:m.from.id,p_update:body.update_id,p_field:field});
    if(error) {await send(m.chat.id,"Este registro expirou. Envie /diario para continuar.");return;}
    if(data) await send(m.chat.id,message,keyboard);
   };
   const save=async(field:Field,value:unknown)=>{
    const {data,error}=await admin.rpc("telegram_diary_field",{p_update:body.update_id,p_telegram:m.from.id,p_field:field,p_value:value});
    if(error) {await send(m.chat.id,"Não consegui salvar: "+(error.message || "tente novamente")+".",menuKeyboard);return;}
    if(field==="finalize") await send(m.chat.id,"✅ Diário de "+today()+" finalizado!\n\n"+summaryText(data,place,today())+"\n\nNo site ele aparece como finalizado. Para um novo registro, envie /diario.");
    else await send(m.chat.id,savedText(field,data)+"\n\nO que mais? Envie fotos ou use os botões.",menuKeyboard);
   };
   if(action==="photos") {await ask(null,PHOTO_HELP,menuKeyboard);return response({ok:true});}
   if(action==="summary") {await ask(null,summaryText(await summary(),place,today()),menuKeyboard);return response({ok:true});}
   if(action==="finalize") {
    const s=await summary();
    const gaps=missing(s);
    await ask("finalize",summaryText(s,place,today())+(gaps.length ? "\n\nAtenção: falta "+gaps.join(" e ")+"." : "")+"\n\nDepois de finalizado, o diário fica só para consulta. Confirma?",confirmKeyboard);
    return response({ok:true});
   }
   if(action) {await ask(action,QUESTIONS[action as keyof typeof QUESTIONS],action==="weather" ? weatherKeyboard : backKeyboard);return response({ok:true});}
   if(isBack(text)) {await ask(null,"Ok. Envie fotos ou use os botões.",menuKeyboard);return response({ok:true});}
   if(session.awaiting==="finalize") {
    if(isConfirm(text)) await save("finalize",null);
    else await ask(null,"Finalização cancelada. Continue enviando ou toque em Finalizar diário.",menuKeyboard);
    return response({ok:true});
   }
   if(session.awaiting && text && !text.startsWith("/")) {
    const field=session.awaiting as Exclude<Field,"finalize">;
    const value=field==="weather" ? parseWeather(text) : field==="workers" ? parseWorkers(text) : field==="equipment" ? parseEquipment(text) : text.length<=2000 ? text : undefined;
    if(value===undefined) {await send(m.chat.id,INVALID[field],field==="weather" ? weatherKeyboard : backKeyboard);return response({ok:true});}
    await save(field,value);
    return response({ok:true});
   }
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
   await send(m.chat.id,(hasPhoto ? "📷 Foto salva" : "📝 Observação salva")+" — "+name+" → "+budgetName+" → "+today()+"\n\nPode enviar mais fotos. Use os botões para clima, efetivo, equipamentos e ocorrências, e Finalizar diário quando terminar.",menuKeyboard);
   return response({ok:true});
  }
  await send(m.chat.id,"Para registrar o diário, envie /diario. Escolha a obra (ou continue na última), envie fotos e use os botões para clima, efetivo, equipamentos, ocorrências e finalizar.\n\n/obras — consultar suas obras\n/cancelar — cancelar um registro");
  return response({ok:true});
 } catch {
  // Never log credentials, link codes, message bodies or token-bearing URLs.
  return response({error:"Falha temporária no processamento"},500);
 }
});


