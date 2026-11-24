import {h,t} from "./language.ts";
import {brandMark} from "./brand-logo.ts";
import type {Settings} from "../../api-contracts/src/growth-policy.ts";
import "./site-footer.css";
type FooterPage="shop"|"orders"|"wishlist"|"addresses"|"returns"|"support"|"track-reference"|"loyalty"|"compare";
type Options={settings:Settings;compact?:boolean;lastSync?:string;onNavigate?:(page:FooterPage)=>void;onStaff?:()=>void;onShop?:()=>void};
export function siteFooter(options:Options){
 const {settings}=options;
 const year=new Intl.DateTimeFormat("en",{timeZone:"Asia/Tokyo",year:"numeric"}).format(new Date());
 const copyright=()=>h("small",{class:"footer-copyright"},`© ${year} ${settings.name}. ${t("All rights reserved.")}`);
 const top=()=>{document.querySelector<HTMLElement>("main")?.focus({preventScroll:true});window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});};
 const brand=()=>h("div",{class:"footer-brand"},[brandMark(),h("strong",settings.name)]);
 const link=(label:string,action:()=>void)=>h("button",{type:"button",class:"footer-link",onClick:action},label);
 if(options.compact)return h("footer",{class:"store-footer store-footer-compact"},[
  brand(),h("div",{class:"footer-compact-copy"},[copyright(),options.lastSync?h("small",`Last synced ${options.lastSync}`):null]),
  h("nav",{"aria-label":"Footer navigation"},[options.onShop?link("Open customer shop",options.onShop):null,link("Back to top",top)])
 ]);
 const group=(title:string,items:Array<[string,FooterPage]>)=>h("section",{class:"footer-link-group"},[h("h2",title),h("nav",{"aria-label":t(title)},[...items.map(([label,page])=>link(label,()=>options.onNavigate?.(page))),title==="Explore"&&options.onStaff?link("Staff workspace",options.onStaff):null])]);
 return h("footer",{class:"store-footer"},[
  h("button",{type:"button",class:"footer-back-top",onClick:top},[h("span",{"aria-hidden":"true"},"↑"),h("span","Back to top")]),
  h("div",{class:"footer-main"},[
   h("section",{class:"footer-about"},[brand(),h("p",settings.tagline),settings.businessHours?h("small",settings.businessHours):null]),
   group("Explore",[["All products","shop"],["Wishlist","wishlist"],["Compare products","compare"]]),
   group("Your account",[["Your orders","orders"],["Saved addresses","addresses"],["Loyalty rewards","loyalty"]]),
   h("section",{class:"footer-link-group"},[h("h2","Here to help"),h("nav",{"aria-label":"Customer help"},[
    link("Customer support",()=>options.onNavigate?.("support")),link("Track by reference",()=>options.onNavigate?.("track-reference")),link("Returns & refunds",()=>options.onNavigate?.("returns")),
    settings.supportEmail?h("a",{class:"footer-link",href:`mailto:${settings.supportEmail}`},settings.supportEmail):null,
    settings.supportPhone?h("a",{class:"footer-link",href:`tel:${settings.supportPhone.replace(/[^+\d]/g,"")}`},settings.supportPhone):null
   ])])
  ]),
  h("div",{class:"footer-bottom"},[copyright()])
 ]);
}
