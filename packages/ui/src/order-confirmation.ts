export type ConfirmationOrder={id:string;status:string;receipt?:{payment?:{provider:string;state:string}}|null};
export function confirmedOrder(order:ConfirmationOrder){
 if(order.status!=="confirmed")return false;
 const payment=order.receipt?.payment;
 if(!payment)return true;
 return payment.provider==="cod"?(payment.state==="due"||payment.state==="paid"):payment.state==="paid";
}
export function receiptDownloadAllowed(order:ConfirmationOrder,downloaded:ReadonlySet<string>){return confirmedOrder(order)&&!downloaded.has(order.id);}
