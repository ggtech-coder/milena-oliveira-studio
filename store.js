// Banco de dados e contas do site e do painel.
// Com firebase-config.js preenchido usa o Firebase (plano gratuito Spark); sem ele, ou com
// localStorage.mo_local="1" (testes), usa o localStorage do navegador.
// Coleções: config/site (horários, preços, textos), ocupado (horários tomados e bloqueios, leitura pública),
// agendamentos (dados das clientes), usuarios (equipe do painel e permissões), clientes (contas das clientes).
import {FIREBASE,MASTER} from "./firebase-config.js?v=20261112";
let forceLocal=false;try{forceLocal=localStorage.getItem("mo_local")=="1"}catch(e){}
export const ON=!!FIREBASE.projectId&&!forceLocal;
export {MASTER};
const V="https://www.gstatic.com/firebasejs/10.12.2/";
let F,db,app,A,auth;
if(ON){app=(await import(V+"firebase-app.js")).initializeApp(FIREBASE);F=await import(V+"firebase-firestore.js");db=F.getFirestore(app)}

// ---- modo local
const LK="mo_db",lr=()=>{try{return JSON.parse(localStorage.getItem(LK))||{}}catch(e){return{}}},lw=o=>{try{localStorage.setItem(LK,JSON.stringify(o))}catch(e){}};
const isObj=x=>x&&typeof x=="object"&&!Array.isArray(x),merge=(a,b)=>{const r={...a};for(const k in b)r[k]=isObj(b[k])&&isObj(a&&a[k])?merge(a[k],b[k]):b[k];return r};
function lop(o,[op,col,id,data]){const c=o[col]=o[col]||{};if(op=="del")delete c[id];else c[id]=op=="set"?{...data}:op=="put"?merge(c[id],data):{...c[id],...data}}
const lrows=col=>Object.entries(lr()[col]||{}).map(([id,d])=>({id,...d}));

export const stamp=()=>ON?F.serverTimestamp():new Date().toISOString();
export const newId=()=>Date.now().toString(36).slice(-4).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase();
export async function get(col,id){if(!ON)return(lr()[col]||{})[id]||null;const s=await F.getDoc(F.doc(db,col,id));return s.exists()?s.data():null}
const rows=async q=>(await F.getDocs(q)).docs.map(s=>({id:s.id,...s.data()}));
// documentos com campo date entre from e to (datas "AAAA-MM-DD"; to opcional)
export async function range(col,from,to){
 if(!ON)return lrows(col).filter(d=>d.date>=from&&(!to||d.date<=to));
 const w=[F.where("date",">=",from)];if(to)w.push(F.where("date","<=",to));return rows(F.query(F.collection(db,col),...w))}
// documentos em que campo == valor
export async function where(col,field,val){if(!ON)return lrows(col).filter(d=>d[field]==val);return rows(F.query(F.collection(db,col),F.where(field,"==",val)))}
export async function list(col){if(!ON)return lrows(col);return rows(F.collection(db,col))}
// ops: [["set"|"upd"|"put"|"del", coleção, id, dados]] gravados juntos (tudo ou nada)
export async function batch(ops){
 if(!ON){const o=lr();ops.forEach(x=>lop(o,x));return lw(o)}
 const b=F.writeBatch(db);ops.forEach(([op,col,id,data])=>{const r=F.doc(db,col,id);
  op=="del"?b.delete(r):op=="upd"?b.update(r,data):op=="put"?b.set(r,data,{merge:true}):b.set(r,data)});await b.commit()}
export const put=(col,id,data)=>batch([["put",col,id,data]]),upd=(col,id,data)=>batch([["upd",col,id,data]]),del=(col,id)=>batch([["del",col,id]]);

// ---- PIN de "Meus horários": sempre conferido no servidor (pagamentos/worker.js), que limita as tentativas.
// O modo local imita o servidor só para testes.
const ATIVOS=["aguardando","reservado","confirmado"];
function pinLocal(rota,{tel,pin,id}){const o=lr(),P=o.pins=o.pins||{},A=o.agendamentos=o.agendamentos||{},d=P[tel];
 if(rota=="reserva"){if(!A[id]||A[id].telKey!=tel)return{ok:false,motivo:"nao_encontrado"};if(!d){const g=pin||String(Math.floor(Math.random()*1e4)).padStart(4,"0");P[tel]={pin:g};lw(o);return{ok:true,novo:true,pin:g}}if(!pin)return{ok:true,existente:true};return d.pin==pin?{ok:true}:{ok:false,motivo:"errado",restam:4}}
 if(!d||d.pin!=pin)return{ok:false,motivo:"errado",restam:4};

 if(rota=="cancelar"){if(!A[id]||A[id].telKey!=tel)return{ok:false,motivo:"nao_encontrado"};A[id].status="cancelado";A[id].canceladoPor="cliente";if(o.ocupado)delete o.ocupado[id];lw(o);return{ok:true}}
 const L=Object.entries(A).map(([i,b])=>({id:i,...b})).filter(b=>b.telKey==tel),t=b=>new Date(b.date+"T00:00").getTime()+b.start*6e4,now=Date.now();
 return{ok:true,nome:L.at(-1)?.name||"",feitos:L.filter(b=>b.status=="concluido").length,proximos:L.filter(b=>ATIVOS.includes(b.status)&&t(b)>now).map(b=>({...b,pode:t(b)-now>864e5})),historico:L.filter(b=>["concluido","cancelado"].includes(b.status))}}
export async function pin(url,rota,dados){if(!ON)return pinLocal(rota,dados);
 const r=await fetch(url+"/pin/"+rota,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(dados)});if(!r.ok)throw Error("servidor "+r.status);return r.json()}

// ---- contas (painel e clientes). Modo local: contas guardadas em mo_db.auth, sessão em mo_cur.
const subs=[];let cur=null;try{cur=JSON.parse(localStorage.getItem("mo_cur"))}catch(e){}
const lset=u=>{cur=u;try{localStorage.setItem("mo_cur",JSON.stringify(u))}catch(e){}subs.forEach(f=>f(u))};
const lerr=code=>Object.assign(new Error(code),{code});
async function au(){if(!A){A=await import(V+"firebase-auth.js");auth=A.getAuth(app)}return A}
export async function onUser(cb){if(!ON){subs.push(cb);return cb(cur)}(await au()).onAuthStateChanged(auth,cb)}
export async function login(email,pw){email=email.toLowerCase();
 if(!ON){const a=(lr().auth||{})[email];if(!a||a.pw!=pw)throw lerr("auth/invalid-credential");return lset({uid:a.uid,email})}
 await(await au()).signInWithEmailAndPassword(auth,email,pw)}
// cria conta e já entra nela (clientes do site)
export async function signup(email,pw){email=email.toLowerCase();
 if(!ON){const o=lr();o.auth=o.auth||{};if(o.auth[email])throw lerr("auth/email-already-in-use");const uid="L"+newId();o.auth[email]={pw,uid};lw(o);lset({uid,email});return uid}
 return(await(await au()).createUserWithEmailAndPassword(auth,email,pw)).user.uid}
// cria a conta de outra pessoa sem sair da sua (master criando usuários do painel)
export async function createOther(email,pw){email=email.toLowerCase();
 if(!ON){const o=lr();o.auth=o.auth||{};if(o.auth[email])throw lerr("auth/email-already-in-use");const uid="L"+newId();o.auth[email]={pw,uid};lw(o);return uid}
 const {initializeApp,getApps}=await import(V+"firebase-app.js"),a=await au();
 const sec=getApps().find(x=>x.name=="sec")||initializeApp(FIREBASE,"sec"),au2=a.getAuth(sec);
 const uid=(await a.createUserWithEmailAndPassword(au2,email,pw)).user.uid;await a.signOut(au2);return uid}
export async function resetPw(email){if(!ON)return;await(await au()).sendPasswordResetEmail(auth,email)}
export async function logout(){if(!ON)return lset(null);await(await au()).signOut(auth)}
