// Presentation grouping only: native group/SKU IDs remain in member_keys.
export function pickerOptions(variants) {
  const options=new Map(); const pending=[];
  for (const v of variants) {
    const a=v.attributes || {};
    if(v.mapping_source==='needs_review') {pending.push(v);continue;}
    const dimensions=Object.entries(a).filter(([axis,value])=>axis!=='warranty' && value!=null && value!=='')
      .sort(([left],[right])=>left.localeCompare(right));
    if(!dimensions.length) {options.set(v.variant_name,{...v,member_keys:[v.variant_name]});continue;}
    // Warranty remains offer metadata, not a device configuration selector.
    // RAM/package still distinguish configurations; no unknown value inference.
    const key=JSON.stringify(dimensions.map(([axis,value])=>[axis,String(value).trim().toLocaleLowerCase('id-ID')]));
    const old=options.get(key);
    if(old) {
      old.member_keys.push(v.variant_name);
      old.offers_count=(old.offers_count||0)+(v.offers_count||0);
      old.raw_names.push(...(v.raw_names||[]));
      if(v.cheapest_price!=null && (old.cheapest_price==null || v.cheapest_price<old.cheapest_price)) {
        old.cheapest_price=v.cheapest_price;old.cheapest_price_fmt=v.cheapest_price_fmt;
      }
      const markets=new Map();
      for(const offer of [...(old.marketplaces||[]),...(v.marketplaces||[])]) {
        const previous=markets.get(offer.marketplace);
        if(!previous || offer.price_int<previous.price_int)markets.set(offer.marketplace,offer);
      }
      old.marketplaces=[...markets.values()];
    } else options.set(key,{...v,attributes:{...a},
      display_name:['ram','capacity','size','screen_size','band_size','volume','weight','count',
        'connectivity','color','material','flavor','scent','power','voltage','length','condition','package']
        .filter(axis=>a[axis]).map(axis=>axis==='ram'?`RAM ${a[axis]}`:a[axis]).join(' · ') || v.display_name,
      member_keys:[v.variant_name],raw_names:[...(v.raw_names||[])]});
  }
  return {options:[...options.values()],pending};
}
