-- Only this explicit, read-only catalog view is exposed to PostGraphile.
CREATE SCHEMA IF NOT EXISTS training3_api;
REVOKE ALL ON SCHEMA training3_api FROM PUBLIC;
CREATE VIEW training3_api.inventory_products AS
SELECT p.id,p.code,p.product_number,p.name,p.description,p.price,p.stock,p.created_at,p.updated_at,
 CASE WHEN i.content_hash IS NOT NULL THEN '/api/product-images/'||p.id||'/'||i.content_hash END AS image_url,
 parent.parent_id AS variant_parent_id,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'name',v.name,'description',v.description,'price',v.price,'stock',v.stock,'label',link.label,'color',link.color,'size',link.size,'imageUrl',CASE WHEN vi.content_hash IS NOT NULL THEN '/api/product-images/'||v.id||'/'||vi.content_hash END) ORDER BY v.product_number) FROM public.store_product_variants link JOIN public.products v ON v.id=link.variant_id LEFT JOIN public.store_product_images vi ON vi.product_id=v.id WHERE link.parent_id=p.id),'[]'::jsonb) AS variants
FROM public.products p LEFT JOIN public.store_product_images i ON i.product_id=p.id LEFT JOIN public.store_product_variants parent ON parent.variant_id=p.id;
COMMENT ON VIEW training3_api.inventory_products IS E'@primaryKey id
@behavior -insert -update -delete';
REVOKE ALL ON training3_api.inventory_products FROM PUBLIC;
