import { nextTick, ref, type Ref } from "vue";
import { h } from "../../../packages/ui/src/language.ts";
import { money, type Product } from "../../../packages/ui/src/storefront.ts";
export function useShoppingHelper(catalog:Ref<Product[]>,navigate:(page:"cart"|"track-reference"|"returns"|"support"|"loyalty")=>void,choose:(product:Product)=>void){
  const open=ref(false),query=ref(""),answer=ref("I can help you find products, track an order, or understand points and coupons."),matches=ref<Product[]>([]);
  function close(){open.value=false;void nextTick(()=>document.getElementById("shopping-helper-toggle")?.focus());}
  function ask(value=query.value){const text=value.trim().toLowerCase();if(!text)return;query.value="";matches.value=[];
    if(/track|order|delivery|注文|配送|订单|物流|ஆர்டர்|விநியோகம்/.test(text)){answer.value="Open tracking and enter the tracking reference from your order.";return;}
    if(/point|reward|loyal|ポイント|积分|புள்ளி/.test(text)){answer.value="Open Loyalty rewards for your balance. At checkout, the points panel shows this order's limit and the savings before you apply points.";return;}
    if(/coupon|discount|offer|クーポン|优惠|கூப்பன்|சலுகை/.test(text)){answer.value="solai26 gives 10% off and santhoshhere341 gives 8% off when the product subtotal is above ¥20,000 after offers, before tax. One coupon per order.";return;}
    if(/return|refund|返品|返金|退货|退款|திரும்ப/.test(text)){answer.value="Use Returns & refunds to request a return. Store staff review the request and inspect returned products before processing a refund.";return;}
    if(/pay|card|qr|支払|付款|கட்டணம்/.test(text)){answer.value="Payment options appear at checkout. Simulated payments use fictional details and do not charge money.";return;}
    const words=text.normalize("NFKC").split(/\s+/).filter(Boolean);
    matches.value=catalog.value.filter(p=>p.stock>0&&words.every(word=>(p.name+" "+p.description).normalize("NFKC").toLowerCase().includes(word))).slice(0,3);
    answer.value=matches.value.length?"Here are matching products currently in stock.":"Try a product name, or use a shortcut below. For account or payment problems, contact customer support.";
  }
  const action=(label:string,page:"cart"|"track-reference"|"returns"|"support"|"loyalty")=>h("button",{type:"button",class:"helper-shortcut",onClick:()=>{navigate(page);close();}},label);
  function render(hidden:boolean){if(hidden)return null;return h("div",{class:"shopping-helper"},[
    open.value?h("section",{class:"helper-panel",role:"dialog","aria-label":"Shopping helper",onKeydown:(e:KeyboardEvent)=>{if(e.key==="Escape")close();}},[
      h("header",[h("div",[h("strong","Solai shopping helper"),h("small","Quick help from your store")]),h("button",{type:"button",class:"helper-close","aria-label":"Close shopping helper",onClick:close},"×")]),
      h("div",{class:"helper-body"},[h("p",{class:"helper-answer","aria-live":"polite"},answer.value),...matches.value.map(p=>h("div",{class:"helper-product"},[h("strong",p.name),h("span",money(p.price)),h("button",{type:"button",class:"btn secondary small",onClick:()=>{choose(p);close();}},"View product")])),h("nav",{"aria-label":"Shopping shortcuts"},[action("Your cart","cart"),action("Track by reference","track-reference"),action("Loyalty rewards","loyalty"),action("Returns & refunds","returns"),action("Customer support","support")])]),
      h("form",{onSubmit:(e:Event)=>{e.preventDefault();ask();}},[h("label",{for:"shopping-helper-input"},"Product name or shopping question"),h("div",[h("input",{id:"shopping-helper-input",value:query.value,maxLength:100,placeholder:"Try headphones, points or tracking",onInput:(e:Event)=>query.value=(e.target as HTMLInputElement).value}),h("button",{type:"submit",class:"btn primary",disabled:!query.value.trim()},"Ask")])])
    ]):null,
    h("button",{id:"shopping-helper-toggle",type:"button",class:"helper-toggle","aria-label":"Shopping helper","aria-expanded":open.value,onClick:()=>{open.value=!open.value;if(open.value)void nextTick(()=>document.getElementById("shopping-helper-input")?.focus());}},[
      h("svg",{viewBox:"0 0 64 64","aria-hidden":"true"},[h("path",{d:"M13 27 8 8l19 12M51 27l5-19-19 12",fill:"#e9b75c",stroke:"#244b36","stroke-width":3}),h("rect",{x:10,y:18,width:44,height:37,rx:18,fill:"#f6df9f",stroke:"#244b36","stroke-width":3}),h("circle",{cx:23,cy:34,r:3,fill:"#244b36"}),h("circle",{cx:41,cy:34,r:3,fill:"#244b36"}),h("path",{d:"m28 42 4 3 4-3m-4 3v4m-9-4h-9m27 0h9",fill:"none",stroke:"#244b36","stroke-width":2,"stroke-linecap":"round"})]),h("span","Need help?")
    ])
  ]);}
  return {render};
}
