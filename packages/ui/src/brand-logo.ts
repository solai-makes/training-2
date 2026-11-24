import {h} from "./language.ts";
import {brandLogoImage} from "./brand-logo-image.ts";
import "./brand-logo.css";
export function brandMark(){return h("img",{class:"brand-logo",src:brandLogoImage,alt:"","aria-hidden":"true",width:52,height:52,decoding:"async",draggable:false});}
export function installBrandIcon(){if(typeof document==="undefined")return;let link=document.querySelector<HTMLLinkElement>('link[rel="icon"]');if(!link){link=document.createElement("link");link.rel="icon";document.head.append(link);}link.type="image/png";link.href=brandLogoImage;}
