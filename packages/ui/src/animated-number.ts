import {defineComponent,h,onMounted,onBeforeUnmount,ref,watch} from "vue";
import {locale} from "./language.ts";
import {money} from "./storefront.ts";
import {countUpValue} from "./count-up.ts";
export const AnimatedNumber=defineComponent({
 name:"AnimatedNumber",inheritAttrs:false,
 props:{value:{type:Number,required:true},format:{type:String,default:"number"},delay:{type:Number,default:0}},
 setup(props,{attrs}){
  const shown=ref(0),running=ref(false),element=ref<HTMLElement|null>(null);
  let frame=0,seen=false,observer:IntersectionObserver|undefined,media:MediaQueryList|undefined;
  function finish(){cancelAnimationFrame(frame);shown.value=Number.isFinite(props.value)?props.value:0;running.value=false;}
  function animate(first=false){cancelAnimationFrame(frame);const target=Number.isFinite(props.value)?props.value:0;
   if(media?.matches||shown.value===target){finish();return;}
   const from=shown.value,start=performance.now()+(first?props.delay:0),duration=first?1100:650;running.value=true;
   function tick(now:number){shown.value=countUpValue(from,target,now-start,duration);if(now-start<duration)frame=requestAnimationFrame(tick);else{shown.value=target;running.value=false;}}
   frame=requestAnimationFrame(tick);
  }
  function start(){if(seen)return;seen=true;observer?.disconnect();animate(true);}
  function motionChanged(){if(media?.matches)finish();}
  onMounted(()=>{
   media=window.matchMedia("(prefers-reduced-motion: reduce)");media.addEventListener("change",motionChanged);
   if(media.matches){seen=true;finish();return;}
   if(typeof IntersectionObserver==="undefined"){start();return;}
   observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))start();},{threshold:0.15});
   if(element.value)observer.observe(element.value);
  });
  watch(()=>props.value,()=>{if(seen)animate();});
  onBeforeUnmount(()=>{cancelAnimationFrame(frame);observer?.disconnect();media?.removeEventListener("change",motionChanged);});
  const format=(value:number)=>props.format==="money"?money(Math.round(value)):props.format==="percent"?new Intl.NumberFormat(locale(),{style:"percent",maximumFractionDigits:1}).format(value):new Intl.NumberFormat(locale(),{maximumFractionDigits:0}).format(Math.round(value));
  return()=>h("strong",{...attrs,ref:element,class:["count-up",attrs.class,{"is-counting":running.value}],"aria-label":format(props.value),"data-count-target":props.value},[h("span",{"aria-hidden":"true"},format(shown.value))]);
 }
});
