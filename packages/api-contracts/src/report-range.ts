const dayMs=86400000;
function date(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new RangeError('Choose valid start and end dates.');const result=new Date(value+'T00:00:00Z');if(!Number.isFinite(result.getTime())||result.toISOString().slice(0,10)!==value)throw new RangeError('Choose valid start and end dates.');return result;}
export function reportRange(input:{days?:number;from?:string;to?:string},today:string){
 const last=date(today);
 let start:Date,end:Date;
 if(input.from!==undefined||input.to!==undefined){if(!input.from||!input.to)throw new RangeError('Choose both start and end dates.');start=date(input.from);end=date(input.to);}
 else {const days=input.days??7;if(![7,15,30].includes(days))throw new RangeError('Choose 7, 15, 30 days or custom dates.');end=last;start=new Date(end.getTime()-(days-1)*dayMs);}
 const days=Math.round((end.getTime()-start.getTime())/dayMs)+1;
 if(days<1)throw new RangeError('The end date must be on or after the start date.');
 if(days>366)throw new RangeError('Choose a date range of 366 days or less.');
 if(end>last)throw new RangeError('The end date cannot be in the future.');
 return {days,from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10),previousFrom:new Date(start.getTime()-days*dayMs).toISOString().slice(0,10)};
}
