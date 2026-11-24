import {QueryClient} from '@tanstack/vue-query';
export const staffQueryClient=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:0,gcTime:60000,refetchOnWindowFocus:false},mutations:{retry:false}}});
let session='';let generation=0;
export function staffSession(authorization:string){if(authorization!==session){session=authorization;generation++;staffQueryClient.clear();}return generation;}
