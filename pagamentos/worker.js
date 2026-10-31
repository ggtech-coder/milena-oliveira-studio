// Servidor de pagamento do sinal (Cloudflare Workers, plano gratuito).
// Rotas:
//   POST /pagar   {id}  -> recalcula o sinal pelos preços salvos no painel e cria o checkout do Mercado Pago
//   POST /webhook       -> aviso do Mercado Pago; com pagamento aprovado, confirma o agendamento
//   GET  /status?id=    -> situação do agendamento (o site consulta na volta do pagamento)
//   cron a cada 10 min  -> reservas não pagas em 40 min expiram e o horário volta a ficar livre
// Segredos (wrangler secret put): MP_TOKEN (Access Token de produção do Mercado Pago)
// e FB_SA (JSON da conta de serviço do Firebase). Variáveis em wrangler.toml.
const SINAL=0.30,PRAZO_MIN=40;

export default{
 async fetch(req,env){const u=new URL(req.url),cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
  const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...cors,"Content-Type":"application/json"}});
  if(req.method=="OPTIONS")return new Response(null,{headers:cors});
  try{
   if(u.pathname=="/pagar"&&req.method=="POST")return J(await pagar(env,(await req.json()).id,u.origin));
   if(u.pathname=="/status"){const id=u.searchParams.get("id");if(id=="TESTE")return J({ok:true,mp:!!env.MP_TOKEN,fb:!!env.FB_SA});const b=await fget(env,"agendamentos/"+limpo(id));return J({status:b?b.status:"nao_encontrado"})}
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
 const sv=((await fget(env,"config/site"))||{}).svc||{};let total=0;
 for(const it of b.itens||[]){const s=sv[it.id];if(!s)throw Error("serviço sem preço no painel: "+it.id);total+=it.v=="m"&&s.m?s.m[0]:s.p}
 for(const[k,q]of Object.entries(b.ex||{})){const s=sv[k];if(!s)throw Error("extra sem preço no painel: "+k);total+=s.p*Math.min(10,Math.max(0,q|0))}
 if(!(total>0))throw Error("valor inválido");const dep=Math.round(total*SINAL*100)/100;
 const back=r=>`${env.SITE_URL}?pg=${id}&r=${r}#agendar`;
 const r=await fetch("https://api.mercadopago.com/checkout/preferences",{method:"POST",headers:{Authorization:"Bearer "+env.MP_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({
  items:[{id,title:("Sinal 30% — "+b.svc).slice(0,250),quantity:1,unit_price:dep,currency_id:"BRL"}],
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
