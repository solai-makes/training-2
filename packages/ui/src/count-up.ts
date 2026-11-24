/** Cubic ease-out reaches the exact target and supports decreasing totals. */
export function countUpValue(from:number,to:number,elapsed:number,duration:number){
 if(!Number.isFinite(to))return 0;
 if(!Number.isFinite(from))from=0;
 if(duration<=0||elapsed>=duration)return to;
 const progress=Math.max(0,Math.min(1,elapsed/duration));
 return from+(to-from)*(1-Math.pow(1-progress,3));
}
