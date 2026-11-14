import sharp from 'sharp';
import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync('lib/exercise-data/exercises.json','utf8'));
const crops={};
for(const exercise of catalog){
 const path=`public/exercises/${exercise.id}.webp`;
 const metadata=await sharp(path).metadata();
 const {info}=await sharp(path).trim({background:'#ffffff',threshold:8}).toBuffer({resolveWithObject:true});
 const left=Math.max(0,-(info.trimOffsetLeft??0)),top=Math.max(0,-(info.trimOffsetTop??0));
 if((left||top||info.width<metadata.width||info.height<metadata.height)&&info.width>metadata.width*.5&&info.height>metadata.height*.4)
  crops[exercise.id]={left:left+(left?2:0),top:top+(top?2:0),width:info.width-(left?4:0),height:info.height-(top?4:0),originalWidth:metadata.width,originalHeight:metadata.height};
}
fs.writeFileSync('lib/exercise-data/photo-crops.json',JSON.stringify(crops,null,1)+'\n');
console.log(`Measured whitespace for ${Object.keys(crops).length} photos; source images unchanged`);
