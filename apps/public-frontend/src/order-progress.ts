import {h} from '../../../packages/ui/src/language.ts';
import './order-progress.css';
export function orderProgress(){return [h('section',{class:'card order-progress',role:'status','aria-live':'polite','aria-atomic':'true'},[
 h('div',{class:'order-progress-orbit','aria-hidden':'true'},[h('span'),h('span'),h('span')]),
 h('span',{class:'eyebrow'},'JUST A MOMENT'),h('h1','Confirming your order…'),
 h('p','Please wait while we check stock and save your order.'),h('small','Please keep this page open.')
])];}
