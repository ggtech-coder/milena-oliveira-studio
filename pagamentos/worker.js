// Servidor de pagamento do sinal (Cloudflare Workers, plano gratuito).
// Rotas:
//   POST /pagar   {id}  -> recalcula o sinal pelos preços salvos no painel e cria o checkout do Mercado Pago
//   POST /webhook       -> aviso do Mercado Pago; com pagamento aprovado, confirma o agendamento
//   GET  /status?id=    -> situação do agendamento (o site consulta na volta do pagamento)
//   POST /pin/reserva  {tel,pin?,id} -> depois da reserva: entrega um PIN novo se o WhatsApp não tem; senão, confere o informado
//   POST /pin/meus     {tel,pin}     -> horários da cliente
//   POST /pin/cancelar {tel,pin,id}  -> cancela um horário dela
//   cron a cada 10 min  -> reservas não pagas em 40 min expiram e o horário volta a ficar livre
// Segredos (wrangler secret put): MP_TOKEN (Access Token de produção do Mercado Pago)
// e FB_SA (JSON da conta de serviço do Firebase). Variáveis em wrangler.toml.
const SINAL=30,PRAZO_MIN=40; // sinal em reais por procedimento (o painel pode mudar em config/site.sinal)

export default{
 async fetch(req,env){const u=new URL(req.url),cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
  const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...cors,"Content-Type":"application/json"}});
  if(req.method=="OPTIONS")return new Response(null,{headers:cors});
  try{
   if(u.pathname=="/pagar"&&req.method=="POST")return J(await pagar(env,(await req.json()).id,u.origin));
   if(u.pathname=="/status"){const id=u.searchParams.get("id");if(id=="TESTE")return J({ok:true,mp:!!env.MP_TOKEN,fb:!!env.FB_SA});const b=await fget(env,"agendamentos/"+limpo(id));return J({status:b?b.status:"nao_encontrado"})}
   if(u.pathname.startsWith("/pin/")&&req.method=="POST"){const rota=PIN_ROTAS[u.pathname.slice(5)];if(!rota)return J({erro:"rota inexistente"},404);return J(await rota(env,await req.json()))}
   if(u.pathname=="/webhook"){let id=u.searchParams.get("data.id")||u.searchParams.get("id"),type=u.searchParams.get("type")||u.searchParams.get("topic");
    if(req.method=="POST"){try{const b=await req.json();id=b.data?.id||id;type=b.type||b.topic||type}catch(e){}}
    if(type=="payment"&&id)await aprovar(env,id);return new Response("ok")}
   return J({erro:"rota inexistente"},404)}
  catch(e){return J({erro:e.message},400)}},
 async scheduled(ev,env,ctx){ctx.waitUntil(expirar(env))}};

const limpo=id=>{if(!/^[A-Za-z0-9]{4,20}$/.test(id||""))throw Error("código inválido");return id};

// ---- Mercado Pago
async function pagar(env,id,origin){limpo(id);
 const b=await fget(env,"agendamentos/"+id);if(!b)throw Error("agendamento não encontrado");
 if(b.status!="aguardando")throw Error("este agendamento não está aguardando pagamento");
 // o valor nunca vem do navegador: é recalculado com os preços do painel (config/site.svc)
 const cfg=(await fget(env,"config/site"))||{},sv=cfg.svc||{};let total=0;
 for(const it of b.itens||[]){const s=sv[it.id];if(!s)throw Error("serviço sem preço no painel: "+it.id);total+=it.v=="m"&&s.m?s.m[0]:s.p}
 for(const[k,q]of Object.entries(b.ex||{})){const s=sv[k];if(!s)throw Error("extra sem preço no painel: "+k);total+=s.p*Math.min(10,Math.max(0,q|0))}
 if(!(total>0))throw Error("valor inválido");const dep=Math.min(total,Math.round((cfg.sinal??SINAL)*(b.itens||[]).length*100)/100);if(!(dep>0))throw Error("sinal inválido");
 const back=r=>`${env.SITE_URL}?pg=${id}&r=${r}#agendar`;
 const r=await fetch("https://api.mercadopago.com/checkout/preferences",{method:"POST",headers:{Authorization:"Bearer "+env.MP_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({
  items:[{id,title:("Sinal — "+b.svc).slice(0,250),quantity:1,unit_price:dep,currency_id:"BRL"}],
  payer:b.email?{email:b.email}:undefined,external_reference:id,notification_url:origin+"/webhook",
  back_urls:{success:back("ok"),pending:back("pendente"),failure:back("falhou")},auto_return:"approved",
  payment_methods:{excluded_payment_types:[{id:"ticket"}],installments:1},
  expires:true,expiration_date_to:new Date(Date.now()+(PRAZO_MIN-5)*6e4).toISOString(),statement_descriptor:env.DESCRICAO||"STUDIO"})});
 const p=await r.json();if(!p.init_point)throw Error("Mercado Pago recusou: "+(p.message||r.status));
 await fpatch(env,"agendamentos/"+id,{total,dep,mpPref:p.id});return{url:p.init_point}}
async function aprovar(env,pid){
 const r=await fetch("https://api.mercadopago.com/v1/payments/"+encodeURIComponent(pid),{headers:{Authorization:"Bearer "+env.MP_TOKEN}});if(!r.ok)return;
 const p=await r.json(),id=p.external_reference;if(!id||p.status!="approved")return;
 const b=await fget(env,"agendamentos/"+id);if(!b||!["aguardando","expirado"].includes(b.status))return;
 // pagou depois de expirar: devolve o horário à agenda (a equipe vê se houve conflito)
 if(b.status=="expirado")await fpatch(env,"ocupado/"+id,{date:b.date,start:b.start,end:b.end,tipo:"agenda"});
 const t=p.payment_type_id;
 await fpatch(env,"agendamentos/"+id,{status:"confirmado",pago:p.transaction_amount,mpPay:String(p.id),pay:t=="bank_transfer"?"pix":t=="debit_card"?"deb":t=="credit_card"?"cre":"mp",pagoEm:new Date().toISOString(),...(b.status=="expirado"?{obs:(b.obs?b.obs+" · ":"")+"Pagou após expirar: confira se o horário não conflita."}:{})})}
async function expirar(env){
 const rows=await fquery(env,"agendamentos","status","aguardando"),lim=Date.now()-PRAZO_MIN*6e4;
 for(const{id,d}of rows){if(Date.parse(d.criado)>lim)continue;await fpatch(env,"agendamentos/"+id,{status:"expirado"});await fdel(env,"ocupado/"+id)}}

// ---- PIN de "Meus horários". A coleção pins só é lida aqui: as regras do Firestore não deixam o navegador ler.
// Um PIN de 4 números só é seguro com limite de tentativas: depois de 5 erros, o WhatsApp fica 15 minutos travado.
const PIN_TENT=5,PIN_TRAVA_MIN=15,PIN_RESERVA_MIN=30,ATIVOS=["aguardando","reservado","confirmado"];
const pinTel=t=>{t=String(t||"").replace(/\D/g,"");if(!/^\d{10,11}$/.test(t))throw Error("WhatsApp inválido");return t};
const pinNum=p=>{if(!/^\d{4}$/.test(p||""))throw Error("PIN inválido");return p};
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const inicio=b=>Date.parse(b.date+"T00:00:00-03:00")+b.start*6e4;
async function pinConfere(env,tel,pin){const path="pins/"+tel,d=await fget(env,path);if(!d)return{ok:false,motivo:"sem_pin"};
 if((d.ate||0)>Date.now())return{ok:false,motivo:"bloqueado",minutos:Math.ceil((d.ate-Date.now())/6e4)};
 if(await sha(d.salt+":"+pin)==d.hash){if(d.falhas)await fpatch(env,path,{falhas:0,ate:0});return{ok:true}}
 const f=(d.falhas||0)+1,trava=f>=PIN_TENT;await fpatch(env,path,{falhas:trava?0:f,ate:trava?Date.now()+PIN_TRAVA_MIN*6e4:0});
 return trava?{ok:false,motivo:"bloqueado",minutos:PIN_TRAVA_MIN}:{ok:false,motivo:"errado",restam:PIN_TENT-f}}
// quem consulta não descobre se o número tem PIN: a resposta é a mesma de um PIN errado
const pinAcesso=async(env,tel,pin)=>{const r=await pinConfere(env,tel,pin);return r.motivo=="sem_pin"?{ok:false,motivo:"errado"}:r};
const PIN_ROTAS={
 // só entrega PIN a quem acabou de reservar com este WhatsApp; informar um PIN é opcional
 async reserva(env,{tel,pin,id}){tel=pinTel(tel);limpo(id);if(pin)pinNum(pin);const b=await fget(env,"agendamentos/"+id);
  if(!b||b.telKey!=tel||!(Date.parse(b.criado)>Date.now()-PIN_RESERVA_MIN*6e4))return{ok:false,motivo:"nao_encontrado"};
  if(await fget(env,"pins/"+tel))return pin?pinConfere(env,tel,pin):{ok:true,existente:true};
  const novo=pin||String(crypto.getRandomValues(new Uint32Array(1))[0]%1e4).padStart(4,"0"),salt=crypto.randomUUID();
  await fpatch(env,"pins/"+tel,{salt,hash:await sha(salt+":"+novo),falhas:0,ate:0,criado:new Date().toISOString()});return{ok:true,novo:true,pin:novo}},
 async meus(env,{tel,pin}){tel=pinTel(tel);pinNum(pin);const a=await pinAcesso(env,tel,pin);if(!a.ok)return a;
  const[rows,cfg]=await Promise.all([fquery(env,"agendamentos","telKey",tel),fget(env,"config/site")]),now=Date.now(),lim=(cfg?.cancelH??24)*36e5;
  const L=rows.map(({id,d})=>({id,svc:d.svc,date:d.date,start:d.start,end:d.end,status:d.status,name:d.name})).sort((x,y)=>x.date.localeCompare(y.date)||x.start-y.start);
  const prox=L.filter(b=>ATIVOS.includes(b.status)&&inicio(b)>now);
  return{ok:true,nome:L.at(-1)?.name||"",cancelH:lim/36e5,feitos:L.filter(b=>b.status=="concluido").length,proximos:prox.map(b=>({...b,pode:inicio(b)-now>lim})),historico:L.filter(b=>["concluido","cancelado"].includes(b.status)).reverse().slice(0,10)}},
 async cancelar(env,{tel,pin,id}){tel=pinTel(tel);pinNum(pin);limpo(id);const a=await pinAcesso(env,tel,pin);if(!a.ok)return a;
  const b=await fget(env,"agendamentos/"+id),lim=((await fget(env,"config/site"))?.cancelH??24)*36e5;
  if(!b||b.telKey!=tel||!ATIVOS.includes(b.status))return{ok:false,motivo:"nao_encontrado"};
  if(inicio(b)-Date.now()<=lim)return{ok:false,motivo:"em_cima_da_hora"};
  await fpatch(env,"agendamentos/"+id,{status:"cancelado",motivo:"",canceladoPor:"cliente",canceladoEm:new Date().toISOString(),...(b.status=="confirmado"||b.pago?{retido:true}:{})});
  await fdel(env,"ocupado/"+id);return{ok:true}}};

// ---- Firestore (REST com a conta de serviço; não passa pelas regras)
let tok=null,tokAte=0;
const b64=s=>btoa(s).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
async function token(env){if(tok&&Date.now()<tokAte)return tok;
 const sa=JSON.parse(env.FB_SA),now=Math.floor(Date.now()/1000);
 const h=b64(JSON.stringify({alg:"RS256",typ:"JWT"})),c=b64(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/datastore",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
 const der=Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g,"")),x=>x.charCodeAt(0));
 const key=await crypto.subtle.importKey("pkcs8",der,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(h+"."+c)));
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion="+h+"."+c+"."+b64(String.fromCharCode(...sig))});
 const j=await r.json();if(!j.access_token)throw Error("não consegui entrar no Firebase (confira FB_SA)");tok=j.access_token;tokAte=Date.now()+3e6;return tok}
const base=env=>`https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents`;
const hdr=async env=>({Authorization:"Bearer "+await token(env),"Content-Type":"application/json"});
const fromV=v=>"stringValue"in v?v.stringValue:"integerValue"in v?+v.integerValue:"doubleValue"in v?v.doubleValue:"booleanValue"in v?v.booleanValue:"timestampValue"in v?v.timestampValue:
 "mapValue"in v?fromF(v.mapValue.fields||{}):"arrayValue"in v?(v.arrayValue.values||[]).map(fromV):null;
const fromF=f=>Object.fromEntries(Object.entries(f).map(([k,v])=>[k,fromV(v)]));
const toV=x=>x==null?{nullValue:null}:typeof x=="boolean"?{booleanValue:x}:typeof x=="number"?(Number.isInteger(x)?{integerValue:String(x)}:{doubleValue:x}):typeof x=="string"?{stringValue:x}:
 Array.isArray(x)?{arrayValue:{values:x.map(toV)}}:{mapValue:{fields:toF(x)}};
const toF=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,toV(v)]));
async function fget(env,path){const r=await fetch(base(env)+"/"+path,{headers:await hdr(env)});if(r.status==404)return null;if(!r.ok)throw Error("Firestore "+r.status);return fromF((await r.json()).fields||{})}
async function fpatch(env,path,data){const q=Object.keys(data).map(k=>"updateMask.fieldPaths="+encodeURIComponent(k)).join("&");
 const r=await fetch(base(env)+"/"+path+"?"+q,{method:"PATCH",headers:await hdr(env),body:JSON.stringify({fields:toF(data)})});if(!r.ok)throw Error("Firestore "+r.status)}
async function fdel(env,path){await fetch(base(env)+"/"+path,{method:"DELETE",headers:await hdr(env)})}
async function fquery(env,col,field,val){const r=await fetch(base(env)+":runQuery",{method:"POST",headers:await hdr(env),body:JSON.stringify({structuredQuery:{from:[{collectionId:col}],where:{fieldFilter:{field:{fieldPath:field},op:"EQUAL",value:toV(val)}}}})});
 if(!r.ok)throw Error("Firestore "+r.status);return(await r.json()).filter(x=>x.document).map(x=>({id:x.document.name.split("/").pop(),d:fromF(x.document.fields||{})}))}
