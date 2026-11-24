import {db} from './index.ts';
import {deliveryTimeline} from '../../api-contracts/src/delivery-timeline.ts';
import {coversDeliveryArea} from '../../api-contracts/src/delivery-dispatch.ts';

/** One shared database lock serializes automatic and staff assignments. */
export async function syncAutomaticDeliveries(now=Date.now()) {
 const at=new Date(now).toISOString();
 await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026110216)`;
  await tx.$executeRaw`UPDATE store_delivery_assignments a SET released_at=${new Date(now)} FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE a.order_id=o.id AND a.released_at IS NULL AND (o.status='cancelled' OR d.payload->'tracking'->>'stage'='delivered' OR d.payload->'payment'->>'state' IN ('refunded','refund_pending','cancelled','failed'))`;
  const orders=await tx.$queryRaw<Array<{id:string;payload:any}>>`SELECT o.id,d.payload FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.status='confirmed' AND COALESCE(d.payload->'tracking'->>'stage','')<>'delivered' AND COALESCE(d.payload->'payment'->>'state','') NOT IN ('refunded','refund_pending','cancelled','failed') ORDER BY d.payload->>'confirmedAt',o.id FOR UPDATE OF o,d`;
  for(const order of orders){
   const payload=order.payload;
   const start=Date.parse(payload.confirmedAt??'');
   if(!Number.isFinite(start)||start>now)continue;
   // Preserve completed historical orders without assigning a new courier to them.
   const assignments=await tx.$queryRaw<Array<{id:string;person_id:string;name:string;code:string;sample:boolean;on_duty:boolean;dispatched_at:Date|null}>>`SELECT a.id,a.person_id,p.name,p.code,p.sample,p.on_duty,a.dispatched_at FROM store_delivery_assignments a JOIN store_delivery_people p ON p.id=a.person_id WHERE a.order_id=${order.id}::uuid AND a.released_at IS NULL FOR UPDATE OF a,p`;
   let assigned=assignments[0];
   if(assigned&&!assigned.on_duty&&!assigned.dispatched_at){
    await tx.$executeRaw`UPDATE store_delivery_assignments SET released_at=${new Date(now)} WHERE id=${assigned.id}::uuid`;
    assigned=undefined as any;
    delete payload.deliveryPerson;
   }
   // Reserve at shipment; couriers start their delivery leg at five hours.
   if(!assigned&&now>=start+3600000){
    const people=await tx.$queryRaw<Array<{id:string;name:string;code:string;sample:boolean;zones:string[]}>>`SELECT p.id,p.name,p.code,p.sample,p.zones FROM store_delivery_people p WHERE p.on_duty AND NOT EXISTS(SELECT 1 FROM store_delivery_assignments a WHERE a.person_id=p.id AND a.released_at IS NULL) ORDER BY (cardinality(p.zones)>0) DESC,p.name,p.id FOR UPDATE OF p`;
    const person=people.find(p=>coversDeliveryArea(p.zones,String(payload.recipient?.city??'')));
    if(person){
     const rows=await tx.$queryRaw<Array<{id:string}>>`INSERT INTO store_delivery_assignments(person_id,order_id,assigned_at) VALUES(${person.id}::uuid,${order.id}::uuid,${new Date(now)}) RETURNING id`;
     assigned={...person,id:rows[0].id,person_id:person.id,on_duty:true,dispatched_at:null};
     payload.deliveryPerson={id:person.id,name:person.name,code:person.code,sample:person.sample,assignedAt:at};
    }
   }
   const tracking=deliveryTimeline(payload.confirmedAt,{...payload.tracking,stage:payload.tracking?.stage??'confirmed',history:payload.tracking?.history??[],awaitingPartner:now>=start+3600000&&!assigned},now);
   if(!tracking)continue;
   if(assigned){
    payload.deliveryPerson??={id:assigned.person_id,name:assigned.name,code:assigned.code,sample:assigned.sample,assignedAt:at};
    if(['out_for_delivery','delivered'].includes(tracking.stage))await tx.$executeRaw`UPDATE store_delivery_assignments SET dispatched_at=COALESCE(dispatched_at,${new Date(now)}) WHERE id=${assigned.id}::uuid`;
    if(tracking.stage==='delivered')await tx.$executeRaw`UPDATE store_delivery_assignments SET released_at=${new Date(now)} WHERE id=${assigned.id}::uuid`;
   }
   payload.tracking=tracking;
   await tx.$executeRaw`UPDATE store_order_details SET payload=${JSON.stringify(payload)}::jsonb WHERE order_id=${order.id}::uuid`;
  }
 },{timeout:30000});
}
