import './customer-login.css';
import {ref,type VNode} from 'vue';
import {h} from '../../../packages/ui/src/language.ts';
type Session={token:string;name:string;guest:boolean};
export function useCustomerLogin(accept:(session:Session)=>Promise<void>,token:()=>string=()=> ''){
 const mode=ref<'login'|'register'|'legacy'|'settings'>('login');
 const email=ref(''),name=ref(''),password=ref(''),confirmation=ref(''),current=ref('');
 const visible=ref(false),busy=ref(false),error=ref(''),message=ref(''),hasPassword=ref(false);
 async function api(path:string,body?:unknown){const response=await fetch('/api/auth'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}: {})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>null);if(!response.ok)throw Error(data?.message??'Sign-in could not be completed. Please retry.');return data;}
 async function run(action:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';message.value='';try{await action();}catch(e){error.value=(e as Error).message;}finally{busy.value=false;}}
 function reset(){password.value='';confirmation.value='';current.value='';visible.value=false;error.value='';message.value='';}
 async function load(){reset();mode.value='login';if(token().startsWith('ss_')){mode.value='settings';await run(async()=>{const data=await api('/password/status');email.value=data.email;hasPassword.value=data.hasPassword;});}}
 const button=(label:string,action:()=>void,kind='secondary')=>h('button',{type:'button',class:`btn ${kind}`,disabled:busy.value,onClick:action},label);
 const field=(label:string,value:string,set:(v:string)=>void,props:Record<string,unknown>={})=>h('label',{class:'field'},[h('span',label),h('input',{value,required:true,disabled:busy.value,...props,onInput:(e:Event)=>set((e.target as HTMLInputElement).value)})]);
 function secret(label:string,value:string,set:(v:string)=>void,isCurrent=false){const id=isCurrent?'customer-current-password':label==='Confirm password'?'customer-confirm-password':'customer-password';return h('div',{class:'field'},[h('label',{for:id},label),h('div',{class:'customer-password-wrap'},[h('input',{id,type:visible.value?'text':'password',value,required:true,maxlength:128,minlength:mode.value==='login'||isCurrent?1:8,autocomplete:mode.value==='login'||isCurrent?'current-password':'new-password',disabled:busy.value,onInput:(e:Event)=>set((e.target as HTMLInputElement).value)}),h('button',{type:'button',class:'customer-password-eye','aria-label':visible.value?'Hide password':'Show password','aria-pressed':visible.value,disabled:busy.value,onClick:()=>visible.value=!visible.value},[h('svg',{viewBox:'0 0 24 24',width:22,height:22,fill:'none',stroke:'currentColor','stroke-width':1.8,'aria-hidden':true},[h('path',{d:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z'}),h('circle',{cx:12,cy:12,r:3}),visible.value?h('path',{d:'M3 3 21 21'}):null])])])]);}
 async function submit(){await run(async()=>{if(mode.value!=='login'&&password.value!==confirmation.value)throw Error('Passwords do not match.');if(mode.value==='settings'){await api('/password/set',{password:password.value,...(hasPassword.value?{currentPassword:current.value}:{})});password.value='';confirmation.value='';current.value='';hasPassword.value=true;message.value='Password saved. Use your email and password next time.';return;}const session=await api(mode.value==='register'?'/register':'/login',{email:email.value.trim(),password:password.value,...(mode.value==='register'?{name:name.value.trim()}:{})});reset();await accept(session);});}
 return {load,view:(legacy:()=>VNode[])=>mode.value==='legacy'?[...legacy(),button('Back to email sign-in',()=>{reset();mode.value='login';})]:[
  h('span',{class:'eyebrow'},'YOUR SOLAISTORE ACCOUNT'),
  h('h2',{id:'dialog-title'},mode.value==='settings'?'Account password':mode.value==='register'?'Create your account':'Sign in to Solaistore'),
  h('p',{class:'muted'},'Use your email and password. Your orders and saved addresses stay with your account.'),
  mode.value!=='settings'?h('div',{class:'customer-login-tabs'},[button('Sign in',()=>{reset();mode.value='login';},mode.value==='login'?'primary':'secondary'),button('Create account',()=>{reset();mode.value='register';},mode.value==='register'?'primary':'secondary')]):h('p',{class:'customer-account-email'},email.value),
  h('form',{onSubmit:(e:Event)=>{e.preventDefault();void submit();}},[
   mode.value==='register'?field('Your full name',name.value,v=>name.value=v,{autocomplete:'name',maxlength:100}):null,
   mode.value!=='settings'?field('Email address',email.value,v=>email.value=v,{type:'email',autocomplete:'username',maxlength:254,placeholder:'you@example.com'}):null,
   mode.value==='settings'&&hasPassword.value?secret('Current password',current.value,v=>current.value=v,true):null,
   secret(mode.value==='settings'?'New password':'Password',password.value,v=>password.value=v),
   mode.value!=='login'?secret('Confirm password',confirmation.value,v=>confirmation.value=v):null,
   mode.value!=='login'?h('p',{class:'fine-print'},'Use 8–128 characters for your password.'):null,
   error.value?h('p',{class:'form-error',role:'alert'},error.value):null,
   message.value?h('p',{class:'customer-login-success',role:'status'},message.value):null,
   h('button',{type:'submit',class:'btn primary full',disabled:busy.value},busy.value?'Please wait…':mode.value==='settings'?'Save password':mode.value==='register'?'Create account':'Sign in')
  ]),
  mode.value!=='settings'?button('Continue as guest',()=>{void run(async()=>{reset();await accept(await api('/guest',{}));});},'text'):null,
  mode.value!=='settings'?button('Existing training account login',()=>{reset();mode.value='legacy';},'text'):null,
 ]};
}
