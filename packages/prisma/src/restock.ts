import { db } from "./index.ts";
import { StoreError } from "./store.ts";
export async function restockRequests(customer: string){return db.$queryRaw<Array<{productId:string;name:string;stock:number;requestedAt:Date}>>`SELECT p.id AS "productId",p.name,p.stock,r.requested_at AS "requestedAt" FROM store_restock_requests r JOIN products p ON p.id=r.product_id WHERE r.customer_id=${customer} ORDER BY r.requested_at DESC LIMIT 100`;}
export async function requestRestock(customer:string,id:string){return db.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${customer}))`;
 const [p]=await tx.$queryRaw<Array<{stock:number}>>`SELECT stock FROM products WHERE id=${id}::uuid FOR UPDATE`;
 if(!p)throw new StoreError(404,"PRODUCT_NOT_FOUND","Product not found.");
 if(p.stock>0)throw new StoreError(409,"ALREADY_AVAILABLE","This product is available now. Refresh the product page.");
 const [count]=await tx.$queryRaw<Array<{total:bigint}>>`SELECT count(*) AS total FROM store_restock_requests WHERE customer_id=${customer}`;
 const prior=await tx.$queryRaw<Array<{id:string}>>`SELECT product_id AS id FROM store_restock_requests WHERE customer_id=${customer} AND product_id=${id}::uuid`;
 if(!prior.length&&Number(count.total)>=100)throw new StoreError(409,"REQUEST_LIMIT","You can follow up to 100 products. Remove a request first.");
 await tx.$executeRaw`INSERT INTO store_restock_requests(customer_id,product_id) VALUES(${customer},${id}::uuid) ON CONFLICT DO NOTHING`;
 return {saved:true};
});}
export async function cancelRestock(customer:string,id:string){await db.$executeRaw`DELETE FROM store_restock_requests WHERE customer_id=${customer} AND product_id=${id}::uuid`;}
export async function restockDemand(){return db.$queryRaw<Array<{productId:string;name:string;stock:number;requests:number;firstRequestedAt:Date}>>`SELECT p.id AS "productId",p.name,p.stock,count(*)::int AS requests,min(r.requested_at) AS "firstRequestedAt" FROM store_restock_requests r JOIN products p ON p.id=r.product_id GROUP BY p.id ORDER BY count(*) DESC,min(r.requested_at) LIMIT 100`;}
