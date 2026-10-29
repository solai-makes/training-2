import {createHmac,randomInt,randomUUID,timingSafeEqual} from "node:crypto";
import {readFile} from "node:fs/promises";
import {StoreError} from "../../../packages/prisma/src/store.ts";
type Settings={apiKey:string;from:string;testRecipient:string};
async function settings():Promise<Settings>{
 let local:Partial<Settings>={};
 try{local=JSON.parse(await readFile(new URL("../../../.local/email-otp.json",import.meta.url),"utf8"));}catch{}
 return {apiKey:process.env.RESEND_API_KEY??local.apiKey??"",from:process.env.RESEND_FROM??local.from??"",testRecipient:(process.env.RESEND_TEST_RECIPIENT??local.testRecipient??"").trim().toLowerCase()};
}
function testSender(from:string){return /@resend\.dev\s*>?$/i.test(from.trim());}
export async function emailConfigured(){const s=await settings();return s.apiKey.startsWith("re_")&&s.apiKey.length>10&&/^[^\r\n]+@[^\r\n]+$/.test(s.from)&&(!testSender(s.from)||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.testRecipient));}
function digest(key:string,nonce:string,code:string){return createHmac("sha256",key).update("solaistore-email-otp-v1\0"+nonce+"\0"+code).digest("hex");}
export async function sendEmailOtp(recipient:string){
 const s=await settings();if(!await emailConfigured())throw new StoreError(503,"EMAIL_NOT_CONFIGURED","Email OTP is not configured yet. Please contact the store owner.");
 if(testSender(s.from)&&recipient.toLowerCase()!==s.testRecipient)throw new StoreError(400,"EMAIL_TEST_RECIPIENT","Email testing is limited to the Resend account owner's email. A verified sending domain is required for other recipients.");
 const nonce=randomUUID(),code=randomInt(0,1_000_000).toString().padStart(6,"0");let response:Response;
 try{response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+s.apiKey,"Content-Type":"application/json","Idempotency-Key":"solaistore-otp-"+nonce},body:JSON.stringify({from:s.from,to:[recipient],subject:"Your Solaistore sign-in code",text:`Your Solaistore verification code is: ${code}\n\nIt expires in 10 minutes. Never share this code. If you did not request it, ignore this email.`}),signal:AbortSignal.timeout(12000)});}catch{throw new StoreError(503,"EMAIL_UNAVAILABLE","The email service could not be reached. Please try again later.");}
 const result=await response.json().catch(()=>null) as {id?:string}|null;
 if(!response.ok||!result?.id)throw new StoreError(response.status===429?429:503,"EMAIL_SEND_FAILED","The email could not be sent. Check the Resend API key, sender verification, recipient restrictions and free-plan allowance.");
 // Store a keyed digest, never the code. The existing challenge expiry/attempt/replay checks still apply.
 return `em1:${nonce}:${digest(s.apiKey,nonce,code)}`;
}
export async function checkEmailOtp(reference:string,code:string){
 const match=/^em1:([0-9a-f-]{36}):([0-9a-f]{64})$/.exec(reference);if(!match||!/^\d{6}$/.test(code))return false;
 const s=await settings();if(!s.apiKey)return false;return timingSafeEqual(Buffer.from(match[2],"hex"),Buffer.from(digest(s.apiKey,match[1],code),"hex"));
}
