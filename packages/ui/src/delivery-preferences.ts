import { h, t } from "./language.ts";
import type { Recipient } from "./storefront.ts";
export const deliveryOptions = {standard:"Standard delivery",call:"Call before delivery",reception:"Leave at reception",door:"Leave at the door",custom:"Other instructions"} as const;
export function deliverySummary(value?: Recipient | null){if(!value)return "";return [value.deliveryPreference&&value.deliveryPreference!=="standard"?t(deliveryOptions[value.deliveryPreference]):"",value.deliveryPhone? t("Delivery phone")+": "+value.deliveryPhone:"",value.deliveryInstructions??""].filter(Boolean).join(" · ");}
export function deliveryFields(value: Recipient){return h("fieldset",{class:"delivery-preferences"},[
 h("legend","Delivery preferences"),h("p",{class:"muted"},"Choose how you would like your order delivered. Instructions are subject to courier availability."),
 h("label",{class:"field"},[h("span","Delivery option"),h("select",{"aria-label":"Delivery option",value:value.deliveryPreference??"standard",onChange:(e:Event)=>value.deliveryPreference=(e.target as HTMLSelectElement).value as NonNullable<Recipient["deliveryPreference"]>},Object.entries(deliveryOptions).map(([key,label])=>h("option",{value:key},label)))]),
 h("label",{class:"field"},[h("span","Delivery phone"),h("input",{"aria-label":"Delivery phone",type:"tel",autocomplete:"tel",maxlength:30,required:value.deliveryPreference==="call",placeholder:"Include country code",value:value.deliveryPhone??"",onInput:(e:Event)=>value.deliveryPhone=(e.target as HTMLInputElement).value})]),
 h("label",{class:"field"},[h("span","Delivery instructions (optional)"),h("textarea",{"aria-label":"Delivery instructions (optional)",maxlength:400,rows:3,value:value.deliveryInstructions??"",placeholder:"Building entrance, reception desk, or other helpful details",onInput:(e:Event)=>value.deliveryInstructions=(e.target as HTMLTextAreaElement).value})])
]);}
