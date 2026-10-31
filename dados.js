// Dados padrão do studio, usados pelo site (index.html) e pelo painel (admin.html).
// Preços, durações e horários salvos no painel substituem estes valores (ver applyCfg).
const CFG={whatsapp:"",instagram:"",endereco:"",
 sobre:"Studio especializado em alongamento de unhas em gel, esmaltação e extensão de cílios. Atendimento individual, com hora marcada, materiais de qualidade e acabamento caprichado em cada detalhe.",
 depo:[], // depoimentos: [{n:"Nome", t:"texto"}]
 fid:{n:10,premio:"um desconto especial"}, // fidelidade: a cada n atendimentos concluídos
 meta:4000, // meta de faturamento do mês (painel)
 cancelH:24, // a cliente pode cancelar pelo painel até estas horas antes do horário
 pagURL:"", // endereço do servidor de pagamento (Cloudflare Worker); vazio = sem pagamento online
 // horário de funcionamento por dia da semana (0=dom). null = fechado.
 horas:{0:null,1:null,2:["09:00","18:00"],3:["09:00","18:00"],4:["09:00","18:00"],5:["09:00","18:00"],6:["09:00","16:00"]},
 passo:30,diasAFrente:60,antecedenciaH:3};
// p = preço, d = duração em minutos, m = [preço, duração] da manutenção
const SV={
unhas:{label:"Unhas",items:[
 {id:"u1",n:"Alongamento — pequeno e médio",x:"Aplicação, molde F1",p:160,d:180},
 {id:"u2",n:"Alongamento — grande",x:"Aplicação, molde F1",p:200,d:210},
 {id:"u3",n:"Manutenção — pequeno e médio",p:110,d:120},
 {id:"u4",n:"Manutenção — grande",p:150,d:150},
 {id:"u5",n:"Banho em gel",p:110,d:90},
 {id:"u6",n:"Esmaltação em gel — mão",p:70,d:60},
 {id:"u7",n:"Esmaltação em gel — pé",p:75,d:60}],
 note:"Os procedimentos acima já incluem esmaltação em gel ou pó cromo e a cuticulagem.",
 ex:[{id:"e0",n:"Reposição de unha",x:"cada",p:10,d:10},{id:"e1",n:"Decoração 3D",x:"gel sólido, laço ou alto relevo — o par",p:10,d:15},{id:"e2",n:"Encapsulada",x:"o par",p:15,d:15},{id:"e3",n:"Nail art",p:30,d:20}]},
cilios:{label:"Cílios",items:[
 {id:"c1",n:"Volume Express",x:"Sem manutenção. Preenchimento somente da primeira camada.",p:90,d:120},
 {id:"c2",n:"Volume Brasileiro",p:140,d:150,m:[90,90]},
 {id:"c3",n:"Volume Inglês",p:150,d:150,m:[100,90]},
 {id:"c4",n:"Volume Árabe",p:140,d:150,m:[90,90]},
 {id:"c5",n:"Volume Luxo",p:160,d:150,m:[110,100]},
 {id:"c6",n:"Volume Fox",p:180,d:180,m:[130,120]},
 {id:"c7",n:"Volume Sirena",x:"Sem manutenção",p:140,d:150},
 {id:"c8",n:"Volume Power",x:"Sem manutenção",p:190,d:180}]}};
const all=[...SV.unhas.items,...SV.unhas.ex,...SV.cilios.items];
// aplica a configuração salva no banco (documento config/site) sobre os valores padrão
const CFG_KEYS=["horas","passo","diasAFrente","antecedenciaH","whatsapp","instagram","endereco","sobre","depo","fid","meta","cancelH","pagURL"];
function applyCfg(c){if(!c)return;CFG_KEYS.forEach(k=>{if(c[k]!=null)CFG[k]=c[k]});
 all.forEach(i=>{const v=c.svc&&c.svc[i.id];if(!v)return;i.p=v.p;i.d=v.d;if(i.m&&v.m)i.m=v.m})}
