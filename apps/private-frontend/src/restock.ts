import {ref} from "vue";
import {h} from "../../../packages/ui/src/language.ts";
import type {Requester} from "../../../packages/ui/src/shopping-tools.ts";
type Row={productId:string;name:string;stock:number;requests:number};
export function useRestockDemand(request:Requester,edit:(id:string)=>void){const rows=ref<Row[]>([]),error=ref("");let busy=false;
 async function load(){if(busy)return;busy=true;try{rows.value=((await request("/store/restock")) as {items:Row[]}).items;error.value="";}catch(e){error.value=(e as Error).message;}finally{busy=false;}}
 function panel(){return h("section",{class:"card tools-panel restock-panel"},[h("div",{class:"tools-panel-heading"},[h("h2","Restock demand"),h("button",{type:"button",class:"btn secondary small",onClick:()=>void load()},"Refresh")]),h("p",{class:"muted"},"Products ranked by customer requests. Add stock through the inventory controls."),error.value?h("p",{class:"form-error",role:"alert"},error.value):null,!rows.value.length?h("p","No restock requests yet."):rows.value.map(r=>h("div",{class:"restock-row"},[h("div",[h("strong",r.name),h("small",String(r.requests)+" · "+"requests"+" · "+String(r.stock)+" in stock")]),h("button",{type:"button",class:"btn secondary small",onClick:()=>edit(r.productId)},"Manage stock")]))]);}
 return{load,panel};}
