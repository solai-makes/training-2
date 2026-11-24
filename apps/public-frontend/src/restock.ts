import {ref,watch,type Ref} from "vue";
import {h} from "../../../packages/ui/src/language.ts";
import type {Product} from "../../../packages/ui/src/storefront.ts";
import type {Requester} from "../../../packages/ui/src/shopping-tools.ts";
type Row={productId:string;name:string;stock:number};
export function useRestock(request:Requester, token:Ref<string>, catalog:Ref<Product[]>,notify:(s:string)=>void,login:()=>void,select:(p:Product)=>void){
 const rows=ref<Row[]>([]),busy=ref(false),error=ref("");let epoch=0;
 async function load(){const current=++epoch;if(!token.value){rows.value=[];return;}try{const data=await request("/account/restock") as {items:Row[]};if(current===epoch){rows.value=data.items;error.value="";}}catch(e){if(current===epoch)error.value=(e as Error).message;}}
 watch(token,()=>{rows.value=[];error.value="";void load();},{immediate:true});
 async function save(p:Product){if(!token.value){login();return;}if(busy.value)return;busy.value=true;error.value="";try{await request("/account/restock/"+p.id,{method:"POST"});await load();notify("Restock request saved. Check Your orders for availability updates.");}catch(e){error.value=(e as Error).message;notify(error.value);}finally{busy.value=false;}}
 async function remove(id:string){if(busy.value)return;busy.value=true;try{await request("/account/restock/"+id,{method:"DELETE"});await load();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
 function button(p:Product){if(p.stock>0)return null;return h("button",{type:"button",class:"btn secondary restock-button",disabled:busy.value||rows.value.some(r=>r.productId===p.id),onClick:()=>void save(p)},rows.value.some(r=>r.productId===p.id)?"Restock requested":"Notify me when available");}
 function panel(){if(!token.value)return null;return h("section",{class:"card tools-panel restock-panel"},[
 h("div",{class:"tools-panel-heading"},[h("h2","Your restock requests"),h("button",{type:"button",class:"btn secondary small",onClick:()=>void load()},"Refresh")]),
 h("p",{class:"muted"},"Availability updates appear here. A request does not reserve stock."),error.value?h("p",{class:"form-error",role:"alert"},error.value):null,
 !rows.value.length?h("p","No restock requests yet."):rows.value.map(r=>{const p=catalog.value.find(p=>p.id===r.productId);const available=(p?.stock??r.stock)>0;return h("div",{class:"restock-row"},[h("div",[h("strong",r.name),h("small",available?"Available now":"Waiting for restock")]),available&&p?h("button",{type:"button",class:"btn primary small",onClick:()=>select(p)},"View product"):null,h("button",{type:"button",class:"btn text small",disabled:busy.value,onClick:()=>void remove(r.productId)},"Remove")]);})
 ]);}
 return{button,panel,load};
}
