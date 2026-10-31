// Banco de dados do site e do painel.
// Com firebase-config.js preenchido usa o Firestore (plano gratuito Spark); sem ele, usa o localStorage.
// Coleções: config/site (horários, preços, durações), ocupado (horários tomados e bloqueios, leitura pública),
// agendamentos (dados das clientes, só a dona lê).
import {FIREBASE} from "./firebase-config.js";
export const ON=!!FIREBASE.projectId;
const V="https://www.gstatic.com/firebasejs/10.12.2/";
let F,db,app,A,auth;
if(ON){app=(await import(V+"firebase-app.js")).initializeApp(FIREBASE);F=await import(V+"firebase-firestore.js");db=F.getFirestore(app)}

// ---- modo local
const LK="mo_db",lr=()=>{try{return JSON.parse(localStorage.getItem(LK))||{}}catch(e){return{}}},lw=o=>{try{localStorage.setItem(LK,JSON.stringify(o))}catch(e){}};
function lop(o,[op,col,id,data]){const c=o[col]=o[col]||{};if(op=="del")delete c[id];else c[id]=op=="set"?{...data}:{...c[id],...data}}

export const stamp=()=>ON?F.serverTimestamp():new Date().toISOString();
export const newId=()=>Date.now().toString(36).slice(-4).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase();
export async function get(col,id){if(!ON)return(lr()[col]||{})[id]||null;const s=await F.getDoc(F.doc(db,col,id));return s.exists()?s.data():null}
// documentos com campo date entre from e to (datas "AAAA-MM-DD"; to opcional)
export async function range(col,from,to){
 if(!ON)return Object.entries(lr()[col]||{}).map(([id,d])=>({id,...d})).filter(d=>d.date>=from&&(!to||d.date<=to));
 const w=[F.where("date",">=",from)];if(to)w.push(F.where("date","<=",to));
 return(await F.getDocs(F.query(F.collection(db,col),...w))).docs.map(s=>({id:s.id,...s.data()}))}
// ops: [["set"|"upd"|"put"|"del", coleção, id, dados]] gravados juntos (tudo ou nada)
export async function batch(ops){
 if(!ON){const o=lr();ops.forEach(x=>lop(o,x[0]=="put"?["upd",...x.slice(1)]:x));return lw(o)}
 const b=F.writeBatch(db);ops.forEach(([op,col,id,data])=>{const r=F.doc(db,col,id);
  op=="del"?b.delete(r):op=="upd"?b.update(r,data):op=="put"?b.set(r,data,{merge:true}):b.set(r,data)});await b.commit()}
export const put=(col,id,data)=>batch([["put",col,id,data]]),upd=(col,id,data)=>batch([["upd",col,id,data]]),del=(col,id)=>batch([["del",col,id]]);

// ---- login (só o painel usa)
async function au(){if(!A){A=await import(V+"firebase-auth.js");auth=A.getAuth(app)}return A}
export async function onUser(cb){if(!ON)return cb({email:"modo local"});(await au()).onAuthStateChanged(auth,cb)}
export async function login(email,pw){await(await au()).signInWithEmailAndPassword(auth,email,pw)}
export async function resetPw(email){await(await au()).sendPasswordResetEmail(auth,email)}
export async function logout(){if(ON)await(await au()).signOut(auth)}
