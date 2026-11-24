import {defineComponent,ref,useId,type PropType} from 'vue';
import {h,t,locale} from '../../../packages/ui/src/language.ts';
import {money,date} from '../../../packages/ui/src/storefront.ts';
import type {PriceReport} from '../../../packages/ui/src/shopping-tools.ts';
export const PriceHistoryChart=defineComponent({props:{report:{type:Object as PropType<PriceReport>,required:true}},setup(props){const gradientId=useId().replace(/:/g,'')+'-price-fill',view=ref('changes'),selected=ref<number|null>(null);return()=>{
 const points=props.report.points;if(!points.length)return h('p','Price tracking has not started for this product.');
 const W=860,H=300,left=70,right=24,top=26,bottom=48,maximum=Math.max(1,...points.flatMap(p=>[p.regular,p.selling])),rough=maximum/4,power=10**Math.floor(Math.log10(rough)),unit=rough/power,step=(unit<=1?1:unit<=2?2:unit<=5?5:10)*power,ceiling=Math.ceil(maximum/step)*step;
 const first=Date.parse(points[0].at),last=Math.max(first+1,Date.parse(points.at(-1)!.at));const x=(i:number)=>points.length===1?W/2:left+(view.value==='changes'?i/Math.max(1,points.length-1):(Date.parse(points[i].at)-first)/(last-first))*(W-left-right),y=(v:number)=>H-bottom-v/ceiling*(H-top-bottom);
 const path=(key:'regular'|'selling')=>points.map((p,i)=>i?`H${x(i)}V${y(p[key])}`:`M${x(i)},${y(p[key])}`).join(' ');
 const active=selected.value===null?null:points[selected.value],activeX=selected.value===null?0:x(selected.value);const compact=(v:number)=>'¥'+new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:1}).format(v);
 return h('div',{class:'price-chart-upgraded price-chart-premium'},[
 h('div',{class:'price-premium-summary'},[
 h('div',{class:'price-premium-primary'},[h('small','Current selling price'),h('strong',money(props.report.product.price ?? points.at(-1)?.selling ?? 0)),h('span',props.report.product.name)]),
 h('div',{class:'price-premium-secondary'},[h('div',[h('small','Lowest observed'),h('b',money(Math.min(...points.map(p=>p.selling))))]),h('div',[h('small','Highest observed'),h('b',money(Math.max(...points.map(p=>p.selling))))])])]),
 h('div',{class:'price-premium-legend'},[h('span',{class:'selling'},'Selling price'),h('span',{class:'regular'},'Regular price')]),
 h('div',{class:'price-chart-controls'},[h('p',view.value==='changes'?'Price changes are evenly spaced so nearby updates stay readable.':'Actual time spacing between recorded price changes.'),h('div',{class:'price-chart-tabs'},['changes','time'].map(mode=>h('button',{type:'button','aria-pressed':view.value===mode,onClick:()=>{view.value=mode;selected.value=null;}},mode==='changes'?'Price changes':'Time view')))]),
 h('div',{class:'price-chart-canvas'},[
 h('svg',{viewBox:`0 0 ${W} ${H}`,role:'group','aria-label':t('Regular price & selling price'),onPointerleave:()=>selected.value=null,onPointermove:(e:PointerEvent)=>{if(e.pointerType==='touch')return;const rect=(e.currentTarget as SVGSVGElement).getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*W,py=(e.clientY-rect.top)/rect.height*H;if(px<left||px>W-right||py<top||py>H-bottom){selected.value=null;return;}selected.value=points.reduce((best,_,i)=>Math.abs(x(i)-px)<Math.abs(x(best)-px)?i:best,0);},onKeydown:(e:KeyboardEvent)=>{if(e.key==='Escape')selected.value=null;}},[
 h('defs',[h('linearGradient',{id:gradientId,x1:'0',y1:'0',x2:'0',y2:'1'},[h('stop',{offset:'0%','stop-color':'#229eff','stop-opacity':'.28'}),h('stop',{offset:'100%','stop-color':'#229eff','stop-opacity':'.015'})])]),
 ...Array.from({length:Math.round(ceiling/step)+1},(_,i)=>h('g',[h('line',{x1:left,x2:W-right,y1:y(i*step),y2:y(i*step),stroke:'#ffffff12','stroke-dasharray':i?'3 5':undefined}),h('text',{x:left-12,y:y(i*step)+4,'text-anchor':'end',fill:'#9daab9','font-size':11},compact(i*step))])),
 h('path',{d:path('selling')+` V${H-bottom} H${x(0)} Z`,fill:`url(#${gradientId})`}),h('path',{d:path('regular'),fill:'none',stroke:'#8b94a3','stroke-width':2,'stroke-dasharray':'6 5'}),h('path',{d:path('selling'),fill:'none',stroke:'#229eff','stroke-width':3.5,'stroke-linejoin':'round'}),
 ...points.map((p,i)=>h('circle',{cx:x(i),cy:y(p.selling),r:4,fill:'#161b24',stroke:'#229eff','stroke-width':2,tabindex:0,role:'button','aria-label':date(p.at)+' · '+money(p.selling),onFocus:()=>selected.value=i,onBlur:()=>selected.value=null,onClick:()=>selected.value=i})),
 ...[...new Set([0,Math.floor((points.length-1)/3),Math.floor((points.length-1)*2/3),points.length-1])].map(i=>h('text',{x:x(i),y:H-17,'text-anchor':i===0?'start':i===points.length-1?'end':'middle',fill:'#9daab9','font-size':11},new Date(points[i].at).toLocaleDateString(locale(),{day:'2-digit',month:'short'})+(view.value==='changes'?' · #'+(i+1):''))),
 active?h('g',{'pointer-events':'none'},[h('line',{x1:activeX,x2:activeX,y1:top,y2:H-bottom,stroke:'#229eff','stroke-dasharray':'4 5',opacity:.5}),h('circle',{cx:activeX,cy:y(active.selling),r:8,fill:'#161b24',stroke:'#229eff','stroke-width':3})]):null
 ]),active?h('div',{class:'price-chart-tooltip',role:'status',style:{left:`clamp(10px, calc(${activeX/W*100}% - 110px), calc(100% - 230px))`}},[h('small',date(active.at)),h('div',[h('span','Selling price'),h('strong',money(active.selling))]),h('div',[h('span','Regular price'),h('b',money(active.regular))]),h('p',active.reason)]):null
 ]),h('p',{class:'fine-print'},'Prices stay flat until the next recorded change; vertical steps show exact changes.')
 ]);
};}});
