export const deliveryArea=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
export function coversDeliveryArea(zones:string[],area:string){return zones.length===0||zones.some(zone=>deliveryArea(zone)===deliveryArea(area));}
