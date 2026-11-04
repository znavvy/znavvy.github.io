/**
 * ZNavvy V2 Frontend — Type Definitions
 *
 * Mirrors the data contract produced by scripts/export_to_github.py
 * (products.json + per-product JSON files).
 * Do NOT add fields that aren't present in the actual data export.
 */

/** One marketplace offer summarized per variant for card display */
export interface VariantMarketplaceOffer {
  marketplace: string;
  price_fmt: string;
  price_int: number;
  is_cheapest: boolean;
  sub_attribute?: string;
  url: string;
  scrape_date?: string;
}

/** A canonical variant (storage/RAM tier etc.) projected from current offers */
export interface CanonicalVariant {
  attributes?: Record<string,string>;
  mapping_source?: string;
  member_keys?: string[];
  variant_name: string;
  display_name?: string;
  raw_names?: string[];
  cheapest_price: number | null;
  cheapest_price_fmt: string;
  highest_price_fmt: string;
  offers_count: number;
  has_offers?: boolean;
  marketplaces?: VariantMarketplaceOffer[];
  scrape_date?: string;
}

/** One marketplace offer from offers[] */
export interface Offer {
  marketplace: string;         // "Tokopedia" | "Shopee" | "Blibli" | "Lazada"
  store_name: string;
  price_int: number;
  price_fmt: string;           // "Rp 11.450.000"
  variant: string;             // raw variant from scraper
  canonical_variant: string;   // normalized variant name
  is_cheapest: boolean;
  affiliate_url: string;
  url: string;
  seller_type: string;
  store_badge: string;
  sub_attribute: string;       // e.g. "Standar" or adapter info
  color: string;               // marketplace brand color hex
  icon: string;                // marketplace emoji
  // Fields present in DB export but may be absent in legacy slim products.json
  scrape_date?: string;        // ISO date "2026-10-31" — "tanggal tidak tersedia" if absent
  variant_id?: string;         // marketplace internal variant ID
  price_source?: string;       // "pdp_variant" | "listing_card" etc.
}

/** Card-level data (minimal — fetched in paginated batches) */
export interface ProductCard {
  trend_badges?: Array<{period: string; label: string; valid_until: string}>;
  verification_status?: 'awaiting_refresh' | 'verified_offers';
  image_note?: string;
  id: string;
  title: string;
  category: string;
  thumbnail: string;           // relative path e.g. "static/images/Samsung_Galaxy_S25.webp"
  promo_price: string;         // formatted cheapest offer price
  total_offers: number;
  cheapest_variant: string;    // name of cheapest canonical variant
  canonical_variants: CanonicalVariant[];
  best_marketplace: string;
  scrape_date?: string;        // capture date of cheapest variant offer
}

/** Full product detail (fetched on demand from api/products/{id}.json) */
export interface ProductDetail extends ProductCard {
  price_history?: Array<{variant_key: string; date: string; price_int: number;
    marketplace: string; store_name: string; url: string; variant_id: string}>;
  canonical_name: string;
  is_trending: boolean;
  trend_score: number;
  trend_tag: string;
  trend_rank: number;
  timeframe: string;
  original_price: string;
  savings_fmt: string;
  rating: null;
  total_sold: null;
  features: string[];
  key_specs: string[];
  summary_desc: string;
  pros: string[];
  cons_notes: string[];
  affiliate_url: string;
  slides: string[];
  offers: Offer[];
}

/** Paginated catalog response from api/catalog/page_{n}.json */
export interface CatalogPage {
  page: number;
  total_pages: number;
  total_products: number;
  page_size: number;
  products: ProductCard[];
}

/** Ultra-slim search index entry from api/search_index.json */
export interface SearchEntry {
  id: string;
  title: string;
  category: string;
  min_price: number;          // cheapest canonical variant price
  variant_count: number;
  mp_count: number;           // number of marketplace offers
  page: number;               // page number in catalog/page_N.json
}

/** Marketplace config for display */
export const MARKETPLACE_CONFIG: Record<string, { label: string; color: string }> = {
  tokopedia: { label: 'Tokopedia', color: '#03AC0E' },
  shopee:    { label: 'Shopee',    color: '#EE4D2D' },
  blibli:    { label: 'Blibli',   color: '#0095DA' },
  lazada:    { label: 'Lazada',   color: '#0F146D' },
};

/** Category display names (short form for UI) */
export const CATEGORY_LABELS: Record<string, string> = {
  'Smartphone & Gadget':  'Gadget',
  'Elektronik & Rumah':   'Elektronik',
  'Komputer & Laptop':    'Laptop & PC',
  'Kecantikan & Lifestyle': 'Kecantikan',
};
