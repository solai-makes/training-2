import {computed,defineComponent,onBeforeUnmount,ref,type PropType} from 'vue';
import {h,t,locale} from '../../../packages/ui/src/language.ts';
import {money} from '../../../packages/ui/src/storefront.ts';
type Day={day:string;revenue:number;orders:number};
export const RevenueChart=defineComponent({
 props:{daily:{type:Array as PropType<Day[]>,required:true},from:{type:String,required:true},to:{type:String,required:true}},
 setup(props){
  const selected=ref<number|null>(null);
  let frame=0,pendingIndex:number|null=null;
  const geometry=computed(()=>{const maximum=Math.max(1,...props.daily.map(day=>day.revenue));return {maximum,points:props.daily.map((day,index)=>({day,x:props.daily.length===1?340:24+index*632/(props.daily.length-1),y:178-day.revenue/maximum*145}))};});
  function select(index:number|null){pendingIndex=index;if(frame)return;frame=requestAnimationFrame(()=>{selected.value=pendingIndex;frame=0;});}
  function clear(){if(frame)cancelAnimationFrame(frame);frame=0;pendingIndex=null;selected.value=null;}
  function hover(event:PointerEvent){if(event.pointerType==='touch')return;const svg=event.currentTarget as SVGSVGElement,box=svg.getBoundingClientRect(),x=(event.clientX-box.left)/box.width*680,y=(event.clientY-box.top)/box.height*220;if(x<20||x>660||y<30||y>184){clear();return;}select(Math.max(0,Math.min(props.daily.length-1,Math.round((x-24)/632*(props.daily.length-1)))));}
  onBeforeUnmount(clear);
  return ()=>{
   const {maximum,points}=geometry.value,active=selected.value===null?null:points[selected.value];
   const formatted=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString(locale(),{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
   return h('div',{class:'revenue-interactive'},[
    h('svg',{class:'revenue-chart',viewBox:'0 0 680 220',role:'group','aria-label':t('Revenue trend'),onPointermove:hover,onPointerleave:clear,onKeydown:(event:KeyboardEvent)=>{if(event.key==='Escape')clear();}},[
     ...Array.from({length:4},(_,i)=>h('g',[h('line',{x1:24,x2:656,y1:33+i*48,y2:33+i*48,stroke:'#e3eae4'}),h('text',{x:24,y:25+i*48,fill:'#677a6d','font-size':11},money(Math.round(maximum*(1-i/3))))])),
     h('polygon',{points:`24,178 ${points.map(point=>`${point.x},${point.y}`).join(' ')} 656,178`,fill:'#ddeede'}),
     h('polyline',{points:points.map(point=>`${point.x},${point.y}`).join(' '),fill:'none',stroke:'#397c52','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round',class:'revenue-line'}),
     ...points.map(({day,x,y},index)=>h('circle',{key:day.day,cx:x,cy:y,r:4,fill:'#397c52',tabindex:0,role:'button','aria-label':`${formatted(day.day)}: ${money(day.revenue)} · ${day.orders} ${t('Orders')}`,onFocus:()=>select(index),onBlur:clear,onClick:()=>select(index),class:'revenue-point'})),
     active?h('g',{class:'revenue-active-guide',style:{transform:`translateX(${active.x}px)`},'pointer-events':'none'},[h('line',{x1:0,x2:0,y1:33,y2:178,stroke:'#397c52','stroke-dasharray':'3 5',opacity:.5}),h('circle',{cx:0,cy:active.y,r:11,fill:'#397c52',opacity:.13}),h('circle',{cx:0,cy:active.y,r:5,fill:'#fff',stroke:'#397c52','stroke-width':3})]):null,
     h('text',{x:24,y:210,'font-size':13,fill:'#677a6d'},props.from),h('text',{x:656,y:210,'text-anchor':'end','font-size':13,fill:'#677a6d'},props.to)
    ]),
    active?h('div',{class:'revenue-hover-card',role:'status',style:{left:`clamp(8px, calc(${active.x/680*100}% - 106px), calc(100% - 220px))`}},[
     h('div',{class:'revenue-hover-date'},[h('i',{'aria-hidden':true}),h('span',formatted(active.day.day))]),
     h('small',t('Sales revenue')),
     h('strong',money(active.day.revenue)),
     h('div',{class:'revenue-hover-orders'},[h('span',t('Orders')),h('b',active.day.orders)])
    ]):null
   ]);
  };
 }
});
