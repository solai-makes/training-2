import { Prisma } from "../generated/index.js";
import { db } from "./index.ts";
import { StoreError, type Receipt } from "./store.ts";
import { deliveryTimeline } from "../../api-contracts/src/delivery-timeline.ts";
type Client=Prisma.TransactionClient;
const lock=(tx:Client,customer:string,area:string)=>tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${area+":"+customer},0))`;
export async function wishlist(customer:string){return db.$queryRaw<Array<{productId:string}>>`SELECT product_id AS "productId" FROM store_wishlist WHERE customer_id=${customer} ORDER BY created_at DESC,product_id`;}
export async function saveWishlist(customer:string,ids:string[],strict=false){
 const unique=[...new Set(ids)];if(unique.length>200)throw new StoreError(400,"WISHLIST_LIMIT","Save up to 200 products in your wishlist.");
 return db.$transaction(async tx=>{
  await lock(tx,customer,"wishlist");
  const valid=unique.length?await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM products WHERE id IN (${Prisma.join(unique.map(id=>Prisma.sql`${id}::uuid`))})`):[];
  if(strict&&valid.length!==unique.length)throw new StoreError(404,"PRODUCT_NOT_FOUND","Product not found.");
  const existing=await tx.$queryRaw<Array<{id:string}>>`SELECT product_id AS id FROM store_wishlist WHERE customer_id=${customer}`;
  const combined=new Set([...existing.map(p=>p.id),...valid.map(p=>p.id)]);
  if(combined.size>200)throw new StoreError(409,"WISHLIST_LIMIT","Save up to 200 products in your wishlist. Remove a product first.");
  if(valid.length)await tx.$executeRaw(Prisma.sql`INSERT INTO store_wishlist(customer_id,product_id) VALUES ${Prisma.join(valid.map(p=>Prisma.sql`(${customer},${p.id}::uuid)`))} ON CONFLICT DO NOTHING`);
  return {saved:true};
 });
}
export async function removeWishlist(customer:string,id:string){await db.$executeRaw`DELETE FROM store_wishlist WHERE customer_id=${customer} AND product_id=${id}::uuid`;}
type Payload={title:string;subject:string;target:"tracking"|"returns"|"product";referenceId:string};
export type Notification={id:string;kind:string;payload:Payload;eventAt:Date;readAt:Date|null};
const orderTitles:Record<string,string>={pending:"Payment pending",confirmed:"Order confirmed",packed:"Order packed",shipped:"Order shipped",out_for_delivery:"Out for delivery",delivered:"Order delivered",cancelled:"Order cancelled"};
const returnTitles:Record<string,string>={requested:"Return request received",approved:"Return approved",rejected:"Return declined",received:"Returned items received",refunding:"Refund processing",refunded:"Refund completed",completed:"Return completed"};
export async function notificationFeed(customer:string,now=Date.now()){
 return db.$transaction(async tx=>{
  await lock(tx,customer,"notifications");
  const cutoff=new Date(now-30*86400000);
  async function emit(key:string,kind:string,payload:Payload,at:Date){
   if(!Number.isFinite(at.getTime())||at.getTime()>now||at<cutoff)return;
   await tx.$executeRaw`INSERT INTO store_customer_notifications(customer_id,event_key,kind,payload,event_at) VALUES(${customer},${key},${kind},${JSON.stringify(payload)}::jsonb,${at}) ON CONFLICT(customer_id,event_key) DO NOTHING`;
  }
  const orders=await tx.$queryRaw<Array<{id:string;status:string;updatedAt:Date;receipt:Receipt|null}>>`SELECT o.id,o.status,o.updated_at AS "updatedAt",d.payload AS receipt FROM orders o LEFT JOIN store_order_details d ON d.order_id=o.id WHERE o.customer_id=${customer} AND o.updated_at>=${cutoff} ORDER BY o.updated_at DESC LIMIT 100`;
  for(const order of orders){
   const tracking=order.status==="confirmed"?deliveryTimeline(order.receipt?.confirmedAt,order.receipt?.tracking,now):undefined;
   const stage=tracking?.stage??order.status;
   const at=tracking?.history.find(e=>e.stage===stage)?.at;
   if(orderTitles[stage])await emit("order:"+order.id+":"+stage,"order",{title:orderTitles[stage],subject:order.id.slice(0,8).toUpperCase(),target:"tracking",referenceId:order.id},at?new Date(at):order.updatedAt);
  }
  const returns=await tx.$queryRaw<Array<{id:string;orderId:string;status:string;updatedAt:Date}>>`SELECT id,order_id AS "orderId",status,updated_at AS "updatedAt" FROM store_returns WHERE customer_id=${customer} AND updated_at>=${cutoff} ORDER BY updated_at DESC LIMIT 100`;
  for(const row of returns)if(returnTitles[row.status])await emit("return:"+row.id+":"+row.status,"return",{title:returnTitles[row.status],subject:row.orderId.slice(0,8).toUpperCase(),target:"returns",referenceId:row.orderId},row.updatedAt);
  const restocks=await tx.$queryRaw<Array<{productId:string;name:string;requestedAt:Date;availableAt:Date}>>`SELECT p.id AS "productId",p.name,r.requested_at AS "requestedAt",GREATEST(p.updated_at,r.requested_at) AS "availableAt" FROM store_restock_requests r JOIN products p ON p.id=r.product_id WHERE r.customer_id=${customer} AND p.stock>0 ORDER BY r.requested_at DESC LIMIT 100`;
  for(const row of restocks)await emit("restock:"+row.productId+":"+row.requestedAt.toISOString(),"restock",{title:"Back in stock",subject:row.name,target:"product",referenceId:row.productId},row.availableAt);
  const items=await tx.$queryRaw<Notification[]>`SELECT id,kind,payload,event_at AS "eventAt",read_at AS "readAt" FROM store_customer_notifications WHERE customer_id=${customer} ORDER BY event_at DESC,created_at DESC,id DESC LIMIT 100`;
  const [count]=await tx.$queryRaw<Array<{unread:number}>>`SELECT count(*)::int AS unread FROM store_customer_notifications WHERE customer_id=${customer} AND read_at IS NULL`;
  return {items,unread:count.unread};
 },{timeout:15000});
}
export async function readNotifications(customer:string,id?:string){await db.$transaction(async tx=>{
 await lock(tx,customer,"notifications");
 if(id)await tx.$executeRaw`UPDATE store_customer_notifications SET read_at=now() WHERE customer_id=${customer} AND id=${id}::uuid AND read_at IS NULL`;
 else await tx.$executeRaw`UPDATE store_customer_notifications SET read_at=now() WHERE customer_id=${customer} AND read_at IS NULL`;
});}
