// Dados padrão do studio, usados pelo site (index.html) e pelo painel (admin.html).
// Preços, durações e horários salvos no painel substituem estes valores (ver applyCfg).
const CFG={whatsapp:"11937787606",instagram:"studiomilenaoliveirabr",
 endereco:"Av. Antônio Mathias de Camargo, 273 — Centro, Cotia — SP, 06700-158",
 mapa:"https://maps.app.goo.gl/qfec32yHTFfi69yP6", // link "Como chegar" (Google Maps)
 sobre:"Studio especializado em alongamento de unhas em gel, esmaltação e extensão de cílios. Atendimento individual, com hora marcada, materiais de qualidade e acabamento caprichado em cada detalhe.",
 depo:[], // depoimentos: [{n:"Nome", t:"texto"}]
 fid:{n:10,premio:"um desconto especial"}, // fidelidade: a cada n atendimentos concluídos
 meta:4000, // meta de faturamento do mês (painel)
 sinal:30, // valor do sinal, em reais, por procedimento agendado (unhas + cílios = 2 sinais)
 cancelH:24, // a cliente pode cancelar pelo painel até estas horas antes do horário
 pagURL:"", // endereço do servidor de pagamento (Cloudflare Worker); vazio = sem pagamento online
 srvURL:"https://milena-pagamentos.gg-tech-suporte.workers.dev", // servidor do PIN de "Meus horários"; vazio = PIN desligado
 // horário de funcionamento por dia da semana (0=dom). null = fechado.
 horas:{0:null,1:null,2:["09:00","18:00"],3:["09:00","18:00"],4:["09:00","18:00"],5:["09:00","18:00"],6:["09:00","16:00"]},
 passo:30,diasAFrente:60,antecedenciaH:3};
// p = preço, d = duração em minutos, m = [preço, duração] da manutenção, f = fotos em img/proc/, na ordem em que aparecem ao passar para o lado (sem f = ainda sem foto)
const SV={
unhas:{label:"Unhas",items:[
 {id:"u1",n:"Alongamento — pequeno e médio",x:"Aplicação, molde F1",p:160,d:120,f:["alongamento","n06","n08","n13","n22","n09","n10"]},
 {id:"u2",n:"Alongamento — grande",x:"Aplicação, molde F1",p:200,d:150,f:["n11","n04","n15","n07","n05","n14","n19","n21","n24","n25"]},
 {id:"u3",n:"Manutenção — pequeno e médio",p:110,d:90,f:["n22","n13","n08","n06","n09","n10","alongamento"]},
 {id:"u4",n:"Manutenção — grande",p:150,d:120,f:["n07","n14","n25","n19","n24","n05","n04","n11","n15","n21"]},
 {id:"u5",n:"Banho em gel",p:110,d:90,f:["banho","n17","n18"]},
 {id:"u6",n:"Esmaltação em gel — mão",p:70,d:60,f:["esmaltacao","n16","n23","n12"]},
 {id:"u7",n:"Esmaltação em gel — pé",p:75,d:60}],
 note:"Os procedimentos acima já incluem esmaltação em gel ou pó cromo e a cuticulagem.",
 ex:[{id:"e0",n:"Reposição de unha",x:"cada",p:10,d:10},{id:"e1",n:"Decoração 3D",x:"gel sólido, laço ou alto relevo — o par",p:10,d:15},{id:"e2",n:"Encapsulada",x:"o par",p:15,d:15},{id:"e3",n:"Nail art",p:30,d:30}]},
cilios:{label:"Cílios",items:[
 {id:"c1",n:"Volume Express",x:"Sem manutenção. Preenchimento somente da primeira camada.",p:90,d:90,f:["express"]},
 {id:"c2",n:"Volume Brasileiro",p:140,d:90,m:[90,60],f:["brasileiro"]},
 {id:"c3",n:"Volume Inglês",p:150,d:90,m:[100,60],f:["ingles"]},
 {id:"c4",n:"Volume Árabe",p:140,d:90,m:[90,60],f:["arabe"]},
 {id:"c5",n:"Volume Luxo",p:160,d:90,m:[110,60],f:["luxo"]},
 {id:"c6",n:"Volume Fox",p:180,d:90,m:[130,60],f:["fox"]},
 {id:"c7",n:"Volume Sirena",x:"Sem manutenção",p:140,d:90},
 {id:"c8",n:"Volume Power",x:"Sem manutenção",p:190,d:150,f:["power"]}]}};
const all=[...SV.unhas.items,...SV.unhas.ex,...SV.cilios.items];
// versão da tabela de tempos: quando os tempos padrão mudam, sobe 1. Uma config salva com versão
// menor tem os tempos ignorados (os preços dela continuam valendo) e o painel regrava com os novos.
const SVC_V=2;
// aplica a configuração salva no banco (documento config/site) sobre os valores padrão
const CFG_KEYS=["horas","passo","diasAFrente","antecedenciaH","whatsapp","instagram","endereco","mapa","sobre","depo","fid","meta","cancelH","sinal","pagURL","srvURL"];
function applyCfg(c){if(!c)return;CFG_KEYS.forEach(k=>{if(c[k]!=null&&c[k]!=="")CFG[k]=c[k]});const velha=(c.svcV||1)<SVC_V;
 all.forEach(i=>{const v=c.svc&&c.svc[i.id];if(!v)return;i.p=v.p;if(i.m&&v.m)i.m=[v.m[0],velha?i.m[1]:v.m[1]];if(!velha)i.d=v.d})}
// ---- fotos do site. Cada foto é uma referência: "img/01.jpg" (arquivo do site), "n06" (arquivo em img/proc/) ou
// "db:ID" (foto enviada pelo painel, guardada na coleção "fotos" do banco). O painel (menu Fotos do site, só o
// administrador) grava as listas em config/fotos; applyFotos aplica por cima dos padrões abaixo.
const FOTOS={hero:"img/pro.jpg",sobre:"img/05.jpg",galeria:Array.from({length:16},(_,i)=>"img/"+String(i+1).padStart(2,"0")+".jpg")};
const fotoOk=r=>typeof r=="string"&&/^(db:[A-Za-z0-9]{4,20}|[\w-]{1,40}|img\/[\w\/-]{1,60}\.(jpg|png|webp))$/.test(r);
function applyFotos(c){if(!c)return;["hero","sobre"].forEach(k=>{if(fotoOk(c[k]))FOTOS[k]=c[k]});if(Array.isArray(c.galeria))FOTOS.galeria=c.galeria.filter(fotoOk);
 if(c.proc)all.forEach(i=>{const L=c.proc[i.id];if(Array.isArray(L))i.f=L.filter(fotoOk)})}
const FOTO_PX="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const fotoSrc=r=>r.startsWith("db:")?"":r.includes("/")?r:"img/proc/"+r+".jpg";
// atributos do <img> de uma referência; as fotos do banco são carregadas depois por fotoLoad
const fotoAttr=r=>r.startsWith("db:")?`src="${FOTO_PX}" data-fid="${r.slice(3)}"`:`src="${fotoSrc(r)}"`;
const FOTO_CACHE={};
function fotoLoad(img,get){const id=img.dataset.fid;if(!id)return;delete img.dataset.fid;(FOTO_CACHE[id]=FOTO_CACHE[id]||get("fotos",id)).then(d=>{if(d&&d.d)img.src=d.d}).catch(()=>{delete FOTO_CACHE[id]})}
// carrega as fotos do banco de tudo que aparecer na página (get = DB.get do store.js)
function fotoAuto(get){const run=()=>document.querySelectorAll("img[data-fid]").forEach(i=>fotoLoad(i,get));new MutationObserver(run).observe(document.body,{childList:true,subtree:true});run()}
