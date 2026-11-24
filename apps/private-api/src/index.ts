import {syncAutomaticDeliveries} from "../../../packages/prisma/src/automatic-delivery.ts";
import { serve } from "@hono/node-server";
import { app } from "./app.ts";

const port = Number(process.env.PRIVATE_API_PORT ?? "3001");
serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, () =>
  console.log("private-api listening on port", port),
);

let deliverySyncRunning=false;
async function syncDelivery(){if(deliverySyncRunning)return;deliverySyncRunning=true;try{await syncAutomaticDeliveries();}catch(error){console.error("Automatic delivery update failed",error);}finally{deliverySyncRunning=false;}}
void syncDelivery();
setInterval(()=>void syncDelivery(),5000).unref();
