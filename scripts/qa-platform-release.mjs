import { spawn,execFileSync } from "node:child_process";
import { mkdtemp,readFile,writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
const directory=await mkdtemp(path.join(os.tmpdir(),"easycoach-platform-"));
const dist=".local-dev/platform-browser-"+randomUUID();
const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,"127.0.0.1",()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const base=`http://127.0.0.1:${port}`;
function command(args,env=process.env){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,args,{env,stdio:["ignore","pipe","pipe"],windowsHide:true});let error="";
 child.stdout.on("data",data=>process.stdout.write(data));child.stderr.on("data",data=>{error+=data;});
 child.on("error",reject);child.on("close",code=>code?reject(Error(error.slice(-2500)||`Command exited ${code}`)):resolve());
});}
let server;
try{
 await command(["--experimental-strip-types","scripts/prepare-platform-qa.ts",directory]);
 console.log("Starting isolated Webpack browser server...");
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","-H","127.0.0.1","-p",String(port)],{
  env:{...process.env,LOCAL_DB_PATH:directory,EASYCOACH_EVIDENCE_DIST_DIR:dist},stdio:["ignore","pipe","pipe"],windowsHide:true,
 });
 let logs="";server.stdout.on("data",data=>{logs=(logs+data).slice(-5000);});server.stderr.on("data",data=>{logs=(logs+data).slice(-5000);});
 const deadline=Date.now()+120000;let ready=false;
 while(Date.now()<deadline){try{const response=await fetch(base+"/login",{signal:AbortSignal.timeout(10000)});if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
 if(!ready)throw Error("Isolated server did not become ready: "+logs);
 await command(["scripts/qa-platform-subscriptions.mjs"],{...process.env,TEST_BASE_URL:base,EXERCISE_PLATFORM_ROLES:"true"});
 await command(["scripts/qa-coach-journey.mjs"],{...process.env,TEST_BASE_URL:base});
}finally{
 if(server?.pid){try{if(process.platform==="win32")execFileSync("taskkill",["/PID",String(server.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});else server.kill("SIGTERM");}catch{}}
 // Preserve all current compiler settings and remove only this run's generated includes.
 const source=await readFile("tsconfig.json","utf8"),config=JSON.parse(source);
 config.include=config.include.filter(value=>!value.startsWith(dist+"/"));
 const newline=source.includes("\r\n")?"\r\n":"\n";
 await writeFile("tsconfig.json",(JSON.stringify(config,null,2)+"\n").replace(/\n/g,newline));
}
