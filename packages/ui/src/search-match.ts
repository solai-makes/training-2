export interface SearchableProduct { id: string; name: string; code: string; description?: string | null; variantParentId?: string | null; }
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().trim();
export function searchMatches<T extends SearchableProduct>(products: T[], query: string): T[] {
 const q = normalize(query); if (!q) return [];
 const words = q.split(/\s+/);
 return products.filter(p => !p.variantParentId && words.every(word => normalize(p.name + " " + p.code + " " + (p.description ?? "")).includes(word)))
 .map((p,i) => ({p,i,score:normalize(p.name).startsWith(q)?0:normalize(p.name).includes(q)?1:2}))
 .sort((a,b)=>a.score-b.score||a.i-b.i).map(x=>x.p);
}
