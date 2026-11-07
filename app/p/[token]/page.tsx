import {notFound} from 'next/navigation';
import {ClientPortal} from '@/components/client-portal';
export default async function Portal({params}:{params:Promise<{token:string}>}){const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))notFound();return <ClientPortal token={token}/>}
