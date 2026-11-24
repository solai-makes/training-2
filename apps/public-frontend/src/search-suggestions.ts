import { computed, ref, watch, type Ref } from "vue";
import { h, t } from "../../../packages/ui/src/language.ts";
import { searchMatches } from "../../../packages/ui/src/search-match.ts";
import { money, category, type Product } from "../../../packages/ui/src/storefront.ts";
import "./search-suggestions.css";
export function useSearchSuggestions(catalog: Ref<Product[]>, query: Ref<string>, select: (product: Product)=>void, showResults: ()=>void) {
 const opened=ref(false),active=ref(-1);
 const matches=computed(()=>searchMatches(catalog.value,query.value));
 const items=computed(()=>matches.value.slice(0,8));
 const visible=computed(()=>opened.value&&!!query.value.trim());
 watch(query,()=>{active.value=-1;});
 function close(){opened.value=false;active.value=-1;}
 function open(){opened.value=true;}
 function choose(product: Product){close();select(product);}
 function submit(){close();showResults();}
 function keydown(e: KeyboardEvent){
  if(e.key==="Escape"){close();return;}
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
   e.preventDefault();open();const n=items.value.length;if(n) active.value=(active.value+(e.key==="ArrowDown"?1:-1)+n)%n;
  }else if(e.key==="Enter"&&visible.value&&active.value>=0&&items.value[active.value]){e.preventDefault();choose(items.value[active.value]);}
 }
 function render(){if(!visible.value)return null;return h("div",{class:"search-suggestions"},[
  h("div",{class:"search-suggestions-title"},"Matching products"),
  h("div",{id:"product-search-suggestions",role:"listbox","aria-label":"Matching products"},items.value.map((p,i)=>h("button",{
   type:"button",id:`search-suggestion-${i}`,role:"option","aria-selected":active.value===i,class:{"search-suggestion":true,"is-active":active.value===i},
   onMousedown:(e:MouseEvent)=>e.preventDefault(),onClick:()=>choose(p)
  },[h("span",[h("strong",p.name),h("small",category(p))]),h("b",money(p.price))]))),
  !matches.value.length?h("p",{class:"search-no-results",role:"status"},"No matching products"):h("button",{type:"button",class:"search-view-all",onClick:submit},t("View all matches")+` (${matches.value.length})`)
 ]);}
 return{visible,active,open,close,submit,keydown,render};
}
