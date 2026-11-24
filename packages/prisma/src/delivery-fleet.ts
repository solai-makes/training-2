import {coversDeliveryArea,deliveryArea} from "../../api-contracts/src/delivery-dispatch.ts";
import {db} from './index.ts';
import {StoreError} from './store.ts';
import {deliveryTimeline} from '../../api-contracts/src/delivery-timeline.ts';
async function release(tx: Pick<typeof db,'$executeRaw'>){
 await tx.$executeRaw`UPDATE store_delivery_assignments a SET released_at=now() FROM orders o LEFT JOIN store_order_details d ON d.order_id=o.id WHERE a.order_id=o.id AND a.released_at IS NULL AND (o.status='cancelled' OR (o.status='confirmed' AND (d.payload->'tracking'->>'stage'='delivered')))`;
}
export async function deliveryPeople(){await release(db);return db.$queryRaw<Array<{id:string;name:string;code:string;sample:boolean;experienceYears:number|null;rating:number|null;onDuty:boolean;zones:string[];dispatchState:string|null;orderId:string|null}>>`SELECT p.id,p.name,p.code,p.sample,p.experience_years AS "experienceYears",p.rating,p.on_duty AS "onDuty",p.zones,CASE WHEN a.id IS NULL THEN NULL WHEN a.dispatched_at IS NULL THEN 'reserved' ELSE 'on_delivery' END AS "dispatchState",a.order_id AS "orderId" FROM store_delivery_people p LEFT JOIN store_delivery_assignments a ON a.person_id=p.id AND a.released_at IS NULL ORDER BY p.sample,p.name`;}
export async function addDeliveryPerson(name:string){return db.$queryRaw`INSERT INTO store_delivery_people(name,code) VALUES(${name},${'DP-'+crypto.randomUUID().slice(0,8).toUpperCase()}) RETURNING id,name,code,sample`;}
export async function assignDeliveryPerson(orderId:string,personId:string){
 await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026110216)`;
  await release(tx);
  const rows=await tx.$queryRaw<Array<{status:string;payload:any}>>`SELECT o.status,d.payload FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.id=${orderId}::uuid FOR UPDATE OF o,d`;
  if(!rows.length)throw new StoreError(404,'ORDER_NOT_FOUND','Order not found.');
  const order=rows[0];if(['refunded','refund_pending','cancelled'].includes(order.payload.payment?.state))throw new StoreError(409,'PAYMENT_CLOSED','This payment has closed or is being refunded.');const tracking=deliveryTimeline(order.payload.confirmedAt,order.payload.tracking);
  if(order.status!=='confirmed'||!tracking||!['shipped','out_for_delivery'].includes(tracking.stage))throw new StoreError(409,'DELIVERY_CLOSED','A partner can be reserved after the order is shipped.');
  const people=await tx.$queryRaw<Array<{id:string;name:string;code:string;sample:boolean;on_duty:boolean;zones:string[]}>>`SELECT id,name,code,sample,on_duty,zones FROM store_delivery_people WHERE id=${personId}::uuid FOR UPDATE`;
  if(!people.length)throw new StoreError(404,'PERSON_NOT_FOUND','Delivery person not found.');
  const busy=await tx.$queryRaw<Array<{order_id:string}>>`SELECT order_id FROM store_delivery_assignments WHERE person_id=${personId}::uuid AND released_at IS NULL`;
  if(busy.some(a=>a.order_id!==orderId))throw new StoreError(409,'PERSON_BUSY','This delivery person is already assigned. Choose someone available.');
  if(busy.length)return;
  if(tracking.stage==='out_for_delivery')throw new StoreError(409,'ALREADY_DISPATCHED','Return the parcel to store before changing its partner.');
  if(!people[0].on_duty)throw new StoreError(409,"OFF_DUTY","This partner is off duty. Choose someone on duty.");
  if(!coversDeliveryArea(people[0].zones,String(order.payload.recipient?.city??"")))throw new StoreError(409,"OUTSIDE_ZONE","This partner does not cover the delivery city. Choose a matching partner or update their areas.");
  await tx.$executeRaw`UPDATE store_delivery_assignments SET released_at=now() WHERE order_id=${orderId}::uuid AND released_at IS NULL`;
  await tx.$executeRaw`INSERT INTO store_delivery_assignments(person_id,order_id) VALUES(${personId}::uuid,${orderId}::uuid)`;
  await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{deliveryPerson}',${JSON.stringify({id:people[0].id,name:people[0].name,code:people[0].code,sample:people[0].sample,assignedAt:new Date().toISOString()})}::jsonb) WHERE order_id=${orderId}::uuid`;
 });
}
export async function completeFleetDelivery(orderId:string){
 await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026110216)`;
  const rows=await tx.$queryRaw<Array<{status:string;payload:any}>>`SELECT o.status,d.payload FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.id=${orderId}::uuid FOR UPDATE OF o,d`;
  if(!rows.length||rows[0].status!=='confirmed')throw new StoreError(409,'DELIVERY_CLOSED','This order has no active delivery.');
  const payload=rows[0].payload;
  if(["refunded","refund_pending","cancelled"].includes(payload.payment?.state))throw new StoreError(409,"PAYMENT_CLOSED","This payment has closed or is being refunded.");
  if(!payload.deliveryPerson)throw new StoreError(409,'NO_COURIER','Assign a delivery person first.');
  const prior=deliveryTimeline(payload.confirmedAt,payload.tracking);
  if(!prior)throw new StoreError(409,'DELIVERY_CLOSED','Delivery tracking is unavailable.');
  const active=await tx.$queryRaw<Array<{dispatched_at:Date|null}>>`SELECT dispatched_at FROM store_delivery_assignments WHERE order_id=${orderId}::uuid AND released_at IS NULL FOR UPDATE`;
  if(prior.stage==='delivered')return;
  if(prior.stage!=='out_for_delivery'||!active[0]?.dispatched_at)throw new StoreError(409,'NOT_DISPATCHED','Dispatch the parcel before confirming delivery.');
  const tracking={...prior,stage:'delivered',nextUpdateAt:null,history:[...prior.history,{stage:'delivered',at:new Date().toISOString()}]};
  await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{tracking}',${JSON.stringify(tracking)}::jsonb) WHERE order_id=${orderId}::uuid`;
  await tx.$executeRaw`UPDATE store_delivery_assignments SET released_at=now() WHERE order_id=${orderId}::uuid AND released_at IS NULL`;
 });
}

export async function updateDeliveryProfile(id:string,experienceYears:number|null,rating:number|null){
 if((experienceYears!==null&&(!Number.isInteger(experienceYears)||experienceYears<0||experienceYears>60))||(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5)))throw new StoreError(400,'INVALID_PROFILE','Use 0–60 years and a rating from 1 to 5.');
 const count=await db.$executeRaw`UPDATE store_delivery_people SET experience_years=${experienceYears},rating=${rating} WHERE id=${id}::uuid`;
 if(!count)throw new StoreError(404,'PERSON_NOT_FOUND','Delivery person not found.');
}

export async function updateDispatchSettings(id:string,onDuty:boolean,zones:string[]){
 const clean=[...new Set(zones.map(deliveryArea))];
 if(typeof onDuty!=='boolean'||clean.length>20||clean.some(zone=>!zone||zone.length>60))throw new StoreError(400,'INVALID_ZONES','Use up to 20 delivery cities, each 1–60 characters.');
 await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026110216)`;const count=await tx.$executeRaw`UPDATE store_delivery_people SET on_duty=${onDuty},zones=${clean}::text[] WHERE id=${id}::uuid`;if(!count)throw new StoreError(404,'PERSON_NOT_FOUND','Delivery person not found.');});
}
export async function suggestedDeliveryPerson(orderId:string){
 const rows=await db.$queryRaw<Array<{status:string;payload:any}>>`SELECT o.status,d.payload FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.id=${orderId}::uuid`;
 if(!rows.length)throw new StoreError(404,'ORDER_NOT_FOUND','Order not found.');
 const area=String(rows[0].payload.recipient?.city??'');
 const people=(await deliveryPeople()).filter(person=>person.onDuty&&(!person.orderId||person.orderId===orderId)&&coversDeliveryArea(person.zones,area)).sort((a,b)=>Number(b.zones.length>0)-Number(a.zones.length>0)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 if(!people.length)throw new StoreError(409,'NO_AVAILABLE_PARTNER','No on-duty partner covers this city. Update partner duty or delivery areas.');
 return people.find(person=>person.orderId===orderId)??people[0];
}

export async function dispatchFleetDelivery(orderId:string){
 await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026110216)`;
 const rows=await tx.$queryRaw<Array<{status:string;payload:any}>>`SELECT o.status,d.payload FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.id=${orderId}::uuid FOR UPDATE OF o,d`;
 if(!rows[0]||rows[0].status!=='confirmed')throw new StoreError(409,'DELIVERY_CLOSED','This order is not confirmed.');const payload=rows[0].payload;
 if(['refunded','refund_pending','cancelled'].includes(payload.payment?.state))throw new StoreError(409,'PAYMENT_CLOSED','Payment is closed.');
 const assignments=await tx.$queryRaw<Array<{id:string;on_duty:boolean}>>`SELECT a.id,p.on_duty FROM store_delivery_assignments a JOIN store_delivery_people p ON p.id=a.person_id WHERE a.order_id=${orderId}::uuid AND a.released_at IS NULL FOR UPDATE OF a,p`;
 if(!assignments[0])throw new StoreError(409,'NO_COURIER','Reserve a delivery partner first.');if(!assignments[0].on_duty)throw new StoreError(409,'OFF_DUTY','The reserved partner is off duty. Turn duty on or reserve another partner.');
 const prior=deliveryTimeline(payload.confirmedAt,payload.tracking);if(prior?.stage==='out_for_delivery')return;if(prior?.stage!=='shipped')throw new StoreError(409,'NOT_SHIPPED','The order must be shipped before dispatch.');const at=new Date().toISOString();
 const tracking={...prior,stage:'out_for_delivery',dispatchedAt:at,nextUpdateAt:null,history:[...prior.history,{stage:'out_for_delivery',at}]};
 await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{tracking}',${JSON.stringify(tracking)}::jsonb) WHERE order_id=${orderId}::uuid`;await tx.$executeRaw`UPDATE store_delivery_assignments SET dispatched_at=now() WHERE id=${assignments[0].id}::uuid`;
 });
}
export async function cancelFleetDispatch(orderId:string){await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026110216)`;const rows=await tx.$queryRaw<Array<{status:string;payload:any}>>`SELECT o.status,d.payload FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.id=${orderId}::uuid FOR UPDATE OF o,d`;const row=rows[0];if(!row||row.status!=='confirmed')throw new StoreError(409,'DELIVERY_CLOSED','This order has closed.');const prior=deliveryTimeline(row.payload.confirmedAt,row.payload.tracking);if(!prior||prior.stage==='delivered')throw new StoreError(409,'DELIVERY_CLOSED','Completed deliveries cannot be returned to dispatch.');const tracking={...prior,stage:'shipped',dispatchedAt:null,nextUpdateAt:null,history:prior.history.filter(event=>['confirmed','shipped'].includes(event.stage))};await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload-'deliveryPerson','{tracking}',${JSON.stringify(tracking)}::jsonb) WHERE order_id=${orderId}::uuid`;await tx.$executeRaw`UPDATE store_delivery_assignments SET released_at=now() WHERE order_id=${orderId}::uuid AND released_at IS NULL`;});}
