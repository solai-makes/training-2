import {defineComponent,onMounted,onBeforeUnmount,ref} from "vue";
import {h} from "./language.ts";
import "./back-to-top.css";
export const BackToTop=defineComponent({
 name:"BackToTop",props:{customer:Boolean,hidden:Boolean,focusTarget:{type:String,default:"main"}},
 setup(props){const visible=ref(false);let frame=0;
 function update(){const footer=document.querySelector(".store-footer");const footerVisible=!!footer&&footer.getBoundingClientRect().top<window.innerHeight-20;visible.value=window.scrollY>360&&!footerVisible;frame=0;}
 function scroll(){if(!frame)frame=requestAnimationFrame(update);}
 onMounted(()=>{update();window.addEventListener("scroll",scroll,{passive:true});});
 onBeforeUnmount(()=>{window.removeEventListener("scroll",scroll);cancelAnimationFrame(frame);});
 function top(){document.getElementById(props.focusTarget)?.focus({preventScroll:true});window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}
 return()=>visible.value&&!props.hidden?h("button",{type:"button",class:["back-to-top",{"customer-back-to-top":props.customer}],"aria-label":"Back to top",onClick:top},[h("span",{"aria-hidden":"true"},"↑"),h("span","Back to top")]):null;
 }
});
