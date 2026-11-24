import {computed,onMounted,onBeforeUnmount,ref,watch,type Ref} from "vue";
import {h,t} from "../../../packages/ui/src/language.ts";
import {artSvg,date,money,type Product} from "../../../packages/ui/src/storefront.ts";
import type {Requester} from "../../../packages/ui/src/shopping-tools.ts";
import "./customer-activity.css";
type Notice={id:string;kind:string;payload:{title:string;subject:string;target:"tracking"|"returns"|"product";referenceId:string};eventAt:string;readAt:string|null};
const guestKey="solaistore.guestWishlist";
function guestItems():string[]{try{const ids=JSON.parse(localStorage.getItem(guestKey)??"[]");return Array.isArray(ids)?[...new Set(ids.filter((x):x is string=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)))].slice(0,200):[];}catch{return [];}}
const bell=()=>h("svg",{viewBox:"0 0 24 24",width:22,height:22,fill:"none",stroke:"currentColor","stroke-width":1.7,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"},[h("path",{d:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"})]);
export function useCustomerActivity(request:Requester,token:Ref<string>,catalog:Ref<Product[]>,options:{navigate:(page:"wishlist"|"notifications"|"returns")=>void;openProduct:(p:Product)=>void;add:(p:Product)=>void;openOrder:(id:string)=>Promise<void>;notify:(text:string)=>void;login:()=>void}){
 const ids=ref<string[]>(token.value?[]:guestItems()),notices=ref<Notice[]>([]),unread=ref(0),wishError=ref(""),feedError=ref(""),busy=ref(new Set<string>()),loading=ref(false),reading=ref(false);
 let wishVersion=0,feedVersion=0,timer:ReturnType<typeof setInterval>|undefined;
 const saved=computed(()=>new Set(ids.value));
 async function loadWishlist(){if(!token.value){ids.value=guestItems();return;}const owner=token.value,version=++wishVersion;try{const data=await request("/account/wishlist") as {items:Array<{productId:string}>};if(owner===token.value&&version===wishVersion){ids.value=data.items.map(p=>p.productId);wishError.value="";}}catch(e){if(owner===token.value)wishError.value=(e as Error).message;}}
 async function loadNotifications(){if(!token.value)return;const owner=token.value,version=++feedVersion;try{const data=await request("/account/notifications") as {items:Notice[];unread:number};if(owner===token.value&&version===feedVersion){notices.value=data.items;unread.value=data.unread;feedError.value="";}}catch(e){if(owner===token.value)feedError.value=(e as Error).message;}}
 watch(token,async owner=>{
  wishVersion++;feedVersion++;notices.value=[];unread.value=0;ids.value=owner?[]:guestItems();wishError.value="";feedError.value="";
  if(!owner)return;loading.value=true;
  void loadNotifications();
  try{const guest=guestItems();if(guest.length){await request("/account/wishlist/import",{method:"POST",body:JSON.stringify({productIds:guest})});if(owner===token.value)localStorage.removeItem(guestKey);}if(owner===token.value)await loadWishlist();}catch(e){if(owner===token.value){wishError.value=(e as Error).message;await loadWishlist();}}finally{if(owner===token.value)loading.value=false;}
 },{immediate:true});
 async function toggle(p:Product){if(busy.value.has(p.id))return;
  if(!token.value){const next=saved.value.has(p.id)?ids.value.filter(id=>id!==p.id):[p.id,...ids.value];if(next.length>200){options.notify("Save up to 200 products in your wishlist.");return;}ids.value=next;try{localStorage.setItem(guestKey,JSON.stringify(next));}catch{options.notify("Your browser could not save the wishlist.");}return;}
  const owner=token.value;busy.value=new Set([...busy.value,p.id]);
  try{await request("/account/wishlist/"+p.id,{method:saved.value.has(p.id)?"DELETE":"POST"});if(owner===token.value)await loadWishlist();}catch(e){if(owner===token.value){wishError.value=(e as Error).message;options.notify(wishError.value);}}finally{const next=new Set(busy.value);next.delete(p.id);busy.value=next;}
 }
 async function remove(id:string){const p=catalog.value.find(p=>p.id===id);if(p){await toggle(p);return;}if(token.value)try{await request("/account/wishlist/"+id,{method:"DELETE"});await loadWishlist();}catch(e){wishError.value=(e as Error).message;}else{ids.value=ids.value.filter(x=>x!==id);localStorage.setItem(guestKey,JSON.stringify(ids.value));}}
 function wishlistButton(p:Product,compact=true){const selected=saved.value.has(p.id);return h("button",{type:"button",class:compact?"wishlist-heart":"btn secondary wishlist-full","aria-pressed":selected,"aria-label":t(selected?"Remove {0} from wishlist":"Save {0} to wishlist").replace("{0}",p.name),disabled:busy.value.has(p.id),onClick:()=>void toggle(p)},[h("span",{"aria-hidden":"true"},selected?"♥":"♡"),!compact?t(selected?"Saved to wishlist":"Save to wishlist"):null]);}
 function wishlistPage(){return [h("div",{class:"page-heading"},[h("span",{class:"eyebrow"},"YOUR SAVED FINDS"),h("h1","Your wishlist"),h("p",token.value?"Your saved products stay with your account.":"Saved in this browser. Sign in to keep your wishlist with your account.")]),wishError.value?h("p",{class:"form-error",role:"alert"},wishError.value):null,
  !token.value?h("button",{type:"button",class:"btn secondary",onClick:options.login},"Sign in"):null,
  loading.value?h("p",{role:"status"},"Loading…"):!ids.value.length?h("section",{class:"card wishlist-empty"},[h("h2","Your next favourite is waiting"),h("p","Tap the heart on a product to save it here.")]):
  h("div",{class:"wishlist-grid"},ids.value.map(id=>{const p=catalog.value.find(p=>p.id===id);if(!p)return h("article",{class:"card wishlist-item",key:id},[h("p","Product unavailable"),h("button",{type:"button",class:"btn text",onClick:()=>void remove(id)},"Remove")]);const available=p.stock+(p.variants?.reduce((sum,v)=>sum+v.stock,0)??0)>0;return h("article",{class:"card wishlist-item",key:id},[
   h("button",{type:"button",class:"wishlist-art","aria-label":t("View {0}").replace("{0}",p.name),onClick:()=>options.openProduct(p),innerHTML:artSvg(p)}),
   h("div",{class:"wishlist-details"},[h("h2",p.name),h("strong",money(p.price)),h("small",available?"In stock":"Out of stock"),h("div",{class:"wishlist-actions"},[h("button",{type:"button",class:"btn primary small",disabled:!available,onClick:()=>options.add(p)},p.variants?.length?"Choose options":"Add to cart"),h("button",{type:"button",class:"btn text small",disabled:busy.value.has(id),onClick:()=>void remove(id)},"Remove")])])
  ]);}))];}
 async function markRead(id?:string){if(!token.value||reading.value)return;const owner=token.value;reading.value=true;try{await request(id?"/account/notifications/"+id+"/read":"/account/notifications/read-all",{method:"POST"});if(owner===token.value)await loadNotifications();}catch(e){if(owner===token.value)feedError.value=(e as Error).message;}finally{reading.value=false;}}
 async function openNotice(n:Notice){await markRead(n.id);try{if(n.payload.target==="tracking")await options.openOrder(n.payload.referenceId);else if(n.payload.target==="returns")options.navigate("returns");else{const p=catalog.value.find(p=>p.id===n.payload.referenceId);if(p)options.openProduct(p);else options.notify("Product unavailable");}}catch(e){feedError.value=(e as Error).message;}}
 function notificationBell(){return h("button",{type:"button",class:"notification-bell","aria-label":"Notifications",title:t("Notifications"),onClick:()=>{options.navigate("notifications");void loadNotifications();}},[bell(),unread.value?h("span",{class:"notification-count","aria-label":t("Unread notifications")},unread.value>99?"99+":String(unread.value)):null]);}
 function notificationsPage(){return [h("div",{class:"page-heading notification-heading"},[h("div",[h("span",{class:"eyebrow"},"YOUR STORE UPDATES"),h("h1","Notifications"),h("p","Order, return and restock updates in one place.")]),token.value?h("div",{class:"wishlist-actions"},[h("button",{type:"button",class:"btn secondary",onClick:()=>void loadNotifications()},"Refresh"),h("button",{type:"button",class:"btn secondary",disabled:!unread.value||reading.value,onClick:()=>void markRead()},"Mark all as read")]):null]),
 !token.value?h("section",{class:"card wishlist-empty"},[h("p","Sign in to see your order notifications."),h("button",{type:"button",class:"btn primary",onClick:options.login},"Sign in")]):h("section",{class:"notification-list"},[feedError.value?h("p",{class:"form-error",role:"alert"},feedError.value):null,!notices.value.length?h("div",{class:"card wishlist-empty"},[h("h2","You are all caught up"),h("p","New order, return and restock updates will appear here.")]):notices.value.map(n=>h("article",{class:["card notification-item",{unread:!n.readAt}],key:n.id},[
  h("button",{type:"button",class:"notification-open",onClick:()=>void openNotice(n)},[h("span",{class:"notification-kind"},t(n.kind==="order"?"Order update":n.kind==="return"?"Return update":"Restock update")),h("strong",n.payload.title),h("span",n.kind==="restock"?n.payload.subject:t("Order")+" #"+n.payload.subject),h("time",{datetime:n.eventAt},date(n.eventAt))]),
  !n.readAt?h("button",{type:"button",class:"btn text small",disabled:reading.value,onClick:()=>void markRead(n.id)},"Mark as read"):h("span",{class:"notification-read"},"Read")
 ]))])];}
 function refresh(){if(document.visibilityState==="hidden"||!navigator.onLine)return;void loadNotifications();}
 function storage(e:StorageEvent){if(!token.value&&e.key===guestKey)ids.value=guestItems();}
 onMounted(()=>{timer=setInterval(refresh,15000);window.addEventListener("focus",refresh);window.addEventListener("storage",storage);});
 onBeforeUnmount(()=>{clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("storage",storage);wishVersion++;feedVersion++;});
 return{count:computed(()=>ids.value.length),wishlistButton,wishlistPage,notificationBell,notificationsPage,loadWishlist,loadNotifications};
}

