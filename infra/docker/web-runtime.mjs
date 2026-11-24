import {createServer,request as proxyRequest} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
for(const [name,port,api] of [['public',8080,3000],['private',8081,3001]]){
 const root=resolve('apps/'+name+'-frontend/dist');
 createServer(async(req,res)=>{
  if(req.url?.startsWith('/api/')){
   const upstream=proxyRequest({hostname:'127.0.0.1',port:api,path:req.url.slice(4),method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode??502,reply.headers);reply.pipe(res);});
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'API is starting. Please try again.'}));});req.pipe(upstream);return;
  }
  try{
   const pathname=decodeURIComponent(new URL(req.url??'/','http://local').pathname);let file=resolve(root,'.'+pathname);
   if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
   try{if(!(await stat(file)).isFile())file=resolve(root,'index.html');}catch{file=resolve(root,'index.html');}
   const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':file.endsWith('index.html')?'no-cache':'public, max-age=3600'});res.end(data);
  }catch{res.writeHead(404);res.end();}
 }).listen(port,'0.0.0.0');
}
