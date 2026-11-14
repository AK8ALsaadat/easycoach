import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { rpc,requireCoachIdentity } from "@/lib/server";
import { blankContent,type Program,type Exercise } from "@/lib/model";
import { ProgramEditor } from "@/components/program-editor";
export default async function TeamProgramPage({params}:{params:Promise<{owner:string;client:string}>}) {
  await requireCoachIdentity();const {owner,client}=await params;
  if(!z.uuid().safeParse(owner).success||!z.uuid().safeParse(client).success) notFound();
  const data=await rpc<{client:{id:string;name:string};draft:Program|null;published:Program|null;library:Exercise[]}>("ec_team_program_context",{owner,target:client});
  const current=data.draft??data.published;
  return <main dir="rtl" className="mx-auto max-w-6xl p-5 space-y-5"><Link className="btn" href={`/organization?owner=${owner}`}>← الفريق</Link><h1>برنامج {data.client.name}</h1><p>تُحفظ المسودة مع التحقق من الإصدار، ويظهر البرنامج للمتدرب بعد النشر فقط.</p><ProgramEditor organizationOwner={owner} clientId={client} initial={current?.content??blankContent} name={current?.name??"برنامج تدريبي"} id={data.draft?.id} editRevision={data.draft?.edit_revision} library={data.library} separateNutrition/></main>;
}
