import {openDatabase,rpcLocal,passwordHash} from "../lib/local-db.ts";
import path from "node:path";
import os from "node:os";
const directory=path.resolve(process.argv[2]??"");
if(!directory.startsWith(path.join(os.tmpdir(),"easycoach-platform-design-")))throw Error("Synthetic isolated pixel QA only");
const db=await openDatabase(directory);
try{
 const id="abcdefab-cdef-4abc-8def-abcdefabcdef";
 await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values($1,'pixel-new@example.test',$2,now(),'{\"ec_signup\":true,\"marketing_attribution\":{\"utm_source\":\"tiktok\"}}')",[id,passwordHash("CoachPreview!2026")]);
 await rpcLocal(db,id,"init_profile",{display_name:"Fictional pixel QA owner",requested_role:"coach"});
}finally{await db.close();}
