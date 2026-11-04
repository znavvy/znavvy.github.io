/**
 * product.ts — Client-side product detail page logic
 *
 * Reads `?id=` from URL, fetches api/products/{id}.json,
 * renders product info, variant selector, and offer list.
 *
 * Permalink compatibility:
 *   Old URL: /product/Samsung_Galaxy_S25.html
 *   This page reads both ?id= and the URL path segment as fallback.
 */

import type { ProductDetail, Offer, CanonicalVariant } from '../types.ts';
import {captureDateSummary,validCaptureDate,formatCaptureDate} from './capture-dates.mjs';
import {pickerOptions} from './variant-picker.mjs';

// Marketplace brand config
const MP_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; badge: string }> = {
  tokopedia: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    dot: 'bg-emerald-600',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
  shopee: {
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-300',
    dot: 'bg-orange-600',
    badge: 'bg-orange-50 text-orange-800 border-orange-300',
  },
  blibli: {
    bg: 'bg-sky-50',
    text: 'text-sky-800',
    border: 'border-sky-300',
    dot: 'bg-sky-600',
    badge: 'bg-sky-50 text-sky-800 border-sky-300',
  },
  lazada: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-800',
    border: 'border-indigo-300',
    dot: 'bg-indigo-600',
    badge: 'bg-indigo-50 text-indigo-800 border-indigo-300',
  },
};

function getMpStyle(mpName: string) {
  const key = mpName.toLowerCase();
  return MP_COLORS[key] || {
    bg: 'bg-gray-50',
    text: 'text-gray-800',
    border: 'border-gray-200',
    dot: 'bg-gray-500',
    badge: 'bg-gray-50 text-gray-800 border-gray-200',
  };
}

// ---------- Read product ID from URL ----------

function getProductId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) return id;

  // Fallback: last path segment (e.g. /product/Samsung_Galaxy_S25 from redirect)
  const segs = window.location.pathname.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  if (last && last !== 'product' && last !== 'index.html') {
    return decodeURIComponent(last.replace('.html', ''));
  }
  return null;
}

/** Read ?v= preselected variant from URL (set by catalog variant chip click) */
function getPreselectedVariant(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('v') ?? '';
}

// ---------- DOM refs ----------

const skeleton = document.getElementById('product-skeleton')!;
const errorEl = document.getElementById('product-error')!;
const errorMsg = document.getElementById('product-error-message')!;
const detailEl = document.getElementById('product-detail')!;

const imgEl = document.getElementById('product-image') as HTMLImageElement;
const imgPlaceholder = document.getElementById('product-image-placeholder')!;
const categoryEl = document.getElementById('product-category')!;
const titleEl = document.getElementById('product-title')!;
const variantChips = document.getElementById('variant-chips')!;
const priceEl = document.getElementById('selected-price')!;
const snapshotDateEl = document.getElementById('snapshot-date')!;
const variantLabel = document.getElementById('selected-variant-label')!;
const offersCount = document.getElementById('offers-count-label')!;
const offersList = document.getElementById('offers-list')!;
const offersEmpty = document.getElementById('offers-empty')!;
const scrapeDateNotice = document.getElementById('scrape-date-notice')!;
const scrapeDateValue = document.getElementById('scrape-date-value')!;

// ---------- State ----------

let currentVariant = '';
let productData: ProductDetail | null = null;
let displayVariants: CanonicalVariant[] = [];
let pendingVariants = 0;

// ---------- Fetch product ----------

async function loadProduct(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}.json`);
    if (!res.ok) {
      if (res.status === 404) throw new Error(`Produk "${id}" tidak ditemukan dalam katalog.`);
      throw new Error(`Gagal memuat data produk (HTTP ${res.status}).`);
    }
    productData = await res.json();
    renderProduct(productData!);
  } catch (e) {
    showError(e instanceof Error ? e.message : 'Terjadi kesalahan.');
  }
}

// ---------- Render ----------

function renderProduct(p: ProductDetail): void {
  // Update page title and description
  document.title = `${p.title} — ZNavvy`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', `Bandingkan ${p.total_offers} penawaran ${p.title} dari marketplace terpercaya.`);

  // Image
  if (p.thumbnail) {
    imgEl.src = p.thumbnail;
    imgEl.alt = p.title;
    imgPlaceholder.classList.add('hidden');
    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      imgPlaceholder.classList.remove('hidden');
    };
  } else {
    imgEl.style.display = 'none';
    imgPlaceholder.classList.remove('hidden');
  }

  // Category + title
  categoryEl.textContent = p.category;
  titleEl.textContent = p.title;
  if (p.image_note && !document.getElementById('product-image-note')) {
    const note = document.createElement('p');
    note.id = 'product-image-note';
    note.className = 'mt-2 text-xs text-gray-500';
    note.textContent = p.image_note;
    imgEl.parentElement?.appendChild(note);
  }

  // Variants — respect preselected variant from URL ?v=
  const picker = pickerOptions(p.canonical_variants ?? []);
  const variants = picker.options;
  displayVariants = variants;
  pendingVariants = picker.pending.length;
  const preselected = getPreselectedVariant();
  const defaultVariant =
    (preselected ? variants.find(v => v.variant_name === preselected || v.member_keys?.includes(preselected) || v.raw_names?.includes(preselected)) : null)
    ?? variants.find(v => v.variant_name === p.cheapest_variant || v.member_keys?.includes(p.cheapest_variant))
    ?? variants[0];
  currentVariant = defaultVariant?.variant_name ?? '';

  renderVariantChips(variants, currentVariant);
  renderOffersForVariant(p.offers, currentVariant, defaultVariant);

  // Show detail, hide skeleton
  skeleton.classList.add('hidden');
  detailEl.classList.remove('hidden');
}

function renderVariantChips(variants: CanonicalVariant[], selected: string): void {
  variantChips.innerHTML = '';
  const active=variants.find(v=>v.variant_name===selected);
  const capacities=[...new Set(variants.map(v=>v.attributes?.capacity).filter(Boolean))];
  const selectedCapacity=active?.attributes?.capacity;
  if(capacities.length>1 && selectedCapacity) {
    const row=document.createElement('div');row.className='w-full flex flex-wrap gap-2';
    for(const capacity of capacities) {
      const button=document.createElement('button');button.className=`variant-chip ${capacity===selectedCapacity?'active':''}`;
      button.textContent=capacity!;button.setAttribute('aria-pressed',String(capacity===selectedCapacity));
      button.onclick=()=>{
        const next=variants.find(v=>v.attributes?.capacity===capacity && v.attributes?.color===active?.attributes?.color)
          || variants.find(v=>v.attributes?.capacity===capacity)!;
        chooseVariant(next);
      };row.appendChild(button);
    }variantChips.appendChild(row);
  }
  const visible=selectedCapacity ? variants.filter(v=>v.attributes?.capacity===selectedCapacity) : variants;
  for (const v of visible) {
    const btn = document.createElement('button');
    btn.className = `variant-chip ${v.variant_name === selected ? 'active' : ''}`;
    // Shared normalizer's full label includes every category-specific axis.
    // Color-only labels hid differences such as Wi-Fi/Cellular or band size.
    btn.textContent = v.display_name || v.variant_name;
    btn.dataset.variant = v.variant_name;
    btn.setAttribute('aria-pressed', String(v.variant_name === selected));
    btn.addEventListener('click', () => {
      chooseVariant(v);
    });
    variantChips.appendChild(btn);
  }
  if(pendingVariants) {
    const note=document.createElement('p');note.className='w-full text-xs text-gray-500';
    note.textContent=`${pendingVariants} pilihan belum jelas dan tidak dimasukkan ke perbandingan varian.`;
    variantChips.appendChild(note);
  }
}

function chooseVariant(v:CanonicalVariant):void {
      currentVariant = v.variant_name;
      // Update chip states
      variantChips.querySelectorAll('.variant-chip').forEach(c => {
        c.classList.remove('active');
        (c as HTMLElement).setAttribute('aria-pressed', 'false');
      });
      renderVariantChips(displayVariants,currentVariant);
      // Re-render offers
      renderOffersForVariant(productData!.offers, currentVariant, v);
      const nextUrl = new URL(location.href);
      nextUrl.searchParams.set('v', currentVariant);
      history.replaceState(null, '', nextUrl);
}

function renderOffersForVariant(
  offers: Offer[],
  variantName: string,
  _variantData?: CanonicalVariant
): void {
  // Filter offers for this variant (by canonical_variant)
  const filtered = variantName
    ? offers.filter(o => (_variantData?.member_keys || [variantName]).includes(o.canonical_variant))
    : offers;

  // Sort by price ascending
  const sorted = [...filtered].sort((a, b) => a.price_int - b.price_int);

  // Update header labels
  variantLabel.textContent = _variantData?.display_name || variantName || 'Semua';
  const dates=captureDateSummary(filtered);
  if(dates.first && dates.last) {
    const dateLabel=dates.first===dates.last ? formatCaptureDate(dates.first) : `${formatCaptureDate(dates.first)} – ${formatCaptureDate(dates.last)}`;
    snapshotDateEl.textContent=`Terakhir diperiksa: ${dateLabel}${dates.missing ? ` · ${dates.missing} penawaran tanpa tanggal` : ''}`;
    scrapeDateValue.textContent=dateLabel;
    scrapeDateNotice.classList.remove('hidden');
  } else {
    snapshotDateEl.textContent=filtered.length ? 'Tanggal pemeriksaan belum tersedia; jangan dianggap harga terkini.' : 'Belum ada penawaran untuk varian ini.';
    scrapeDateNotice.classList.add('hidden');
  }
  renderPriceHistory(variantName, _variantData?.display_name || variantName);

  // Render offer rows
  offersList.innerHTML = '';

  if (sorted.length === 0) {
    priceEl.textContent = productData?.verification_status === 'awaiting_refresh' ? 'Harga sedang diperbarui' : 'Belum ada harga terverifikasi';
    const message = offersEmpty.querySelector('p');
    if (message) message.textContent = productData?.verification_status === 'awaiting_refresh'
      ? 'Produk tercatat. Harga dan pilihan toko sedang diverifikasi ulang.'
      : 'Belum ada penawaran terverifikasi untuk varian ini.';
    offersCount.textContent = '0 toko';
    offersEmpty.classList.remove('hidden');
    return;
  }

  offersEmpty.classList.add('hidden');
  priceEl.textContent = sorted[0].price_fmt;

  // Accurately distinguish offer count from unique store count
  const uniqueStores = new Set(
    sorted.filter(o => (o.store_name || '').trim()).map(o => `${o.marketplace.toLowerCase()}:${o.store_name.trim().toLowerCase()}`)
  ).size;
  const storeLabel = uniqueStores === 1 ? '1 toko' : `${uniqueStores} toko`;
  offersCount.textContent = `${sorted.length} penawaran (${storeLabel})`;

  for (const offer of sorted) {
    const row = createOfferRow(offer);
    offersList.appendChild(row);
  }
}

function renderPriceHistory(variantKey: string, displayName: string): void {
  let section = document.getElementById('price-history');
  if (!section) {
    section = document.createElement('section');
    section.id = 'price-history';
    section.className = 'mt-8 rounded-xl border border-gray-200 bg-white p-4';
    detailEl.appendChild(section);
  }
  section.replaceChildren();
  const title = document.createElement('h2');
  title.className = 'font-semibold text-gray-900';
  title.textContent = `Riwayat harga · ${displayName}`;
  section.appendChild(title);
  const note = document.createElement('p');
  note.className = 'mt-1 text-sm text-gray-500';
  note.textContent = 'Harga penawaran yang sama, bukan pergantian toko termurah. Tanggal tanpa pengamatan tidak diisi.';
  section.appendChild(note);
  const keys=displayVariants.find(v=>v.variant_name===variantKey)?.member_keys || [variantKey];
  const points = (productData?.price_history || []).filter(p => keys.includes(p.variant_key) && validCaptureDate(p.date) && Number.isFinite(p.price_int) && p.price_int>0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) {
    const empty = document.createElement('p');
    empty.className = 'mt-4 text-sm text-gray-600';
    empty.textContent = 'Belum ada riwayat harga terverifikasi untuk varian ini.';
    section.appendChild(empty);
    return;
  }
  const summary = document.createElement('p');
  summary.className = 'mt-3 text-sm text-teal-700';
  summary.textContent = points.length === 1
    ? 'Baru 1 pengamatan. Tren naik/turun belum dapat disimpulkan.'
    : `${points.length} pengamatan harga tersimpan.`;
  section.appendChild(summary);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 640 130');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Grafik ${points.length} pengamatan harga ${displayName}; tidak ada interpolasi`);
  svg.style.width = '100%';
  svg.style.maxHeight = '160px';
  const dates = points.map(p => Date.parse(p.date + 'T00:00:00Z'));
  const minDate = Math.min(...dates), dateSpan = Math.max(...dates) - minDate;
  const prices = points.map(p => p.price_int);
  const minPrice = Math.min(...prices), priceSpan = Math.max(...prices) - minPrice;
  points.forEach((point, i) => {
    const dot = document.createElementNS(svg.namespaceURI, 'circle');
    dot.setAttribute('cx', String(dateSpan ? 30 + (dates[i] - minDate) / dateSpan * 580 : 320));
    dot.setAttribute('cy', String(priceSpan ? 100 - (point.price_int - minPrice) / priceSpan * 75 : 65));
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', '#0d9488');
    const tooltip = document.createElementNS(svg.namespaceURI, 'title');
    tooltip.textContent = `${formatCaptureDate(point.date)}: ${new Intl.NumberFormat('id-ID', {style: 'currency', currency: 'IDR', maximumFractionDigits: 0}).format(point.price_int)}`;
    dot.appendChild(tooltip);
    svg.appendChild(dot);
  });
  section.appendChild(svg);
  const table = document.createElement('table');
  table.className = 'w-full text-left text-sm';
  const caption = table.createCaption();
  caption.className = 'text-left text-xs text-gray-500 mb-2';
  caption.textContent = 'Daftar pengamatan aktual';
  const head = table.createTHead().insertRow();
  for (const label of ['Tanggal', 'Harga', 'Toko']) {
    const th = document.createElement('th'); th.textContent = label; th.scope = 'col'; head.appendChild(th);
  }
  const body = table.createTBody();
  for (const point of points) {
    const row = body.insertRow();
    for (const value of [formatCaptureDate(point.date), `Rp ${point.price_int.toLocaleString('id-ID')}`, point.store_name]) {
      const cell = row.insertCell(); cell.className = 'py-2'; cell.textContent = value;
    }
  }
  section.appendChild(table);
}

function createOfferRow(offer: Offer): HTMLElement {
  const div = document.createElement('div');
  div.className = 'offer-row p-3.5 rounded-xl border border-gray-100 hover:border-gray-200 bg-white mb-2 transition-all flex items-center justify-between gap-4';

  const linkHref = offer.affiliate_url || offer.url;
  const mpLabel = offer.marketplace;
  const isCheapest = offer.is_cheapest;
  const mpStyle = getMpStyle(mpLabel);

  // Sub-attribute / bundle package distinction (never treat bundle as unit-only)
  const isBundle = /adapter|paket|bundle|charger/i.test(offer.sub_attribute || '') || /adapter|paket|bundle/i.test(offer.variant || '');
  const subAttr = offer.sub_attribute && offer.sub_attribute.toLowerCase() !== 'standar'
    ? (isBundle
        ? `<span class="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Paket: ${escHtml(offer.sub_attribute)}</span>`
        : `<span class="text-xs text-gray-500">· ${escHtml(offer.sub_attribute)}</span>`)
    : '';

  // Cheapest badge (neutral label, not marketing hype)
  const cheapestBadge = isCheapest
    ? `<span class="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">Termurah</span>`
    : '';

  // Store tier badge with authentic styling
  let tierBadge = '';
  const sType = offer.seller_type || '';
  if (sType === 'Shopee Mall' || sType === 'Official Store' || sType === 'LazMall Flagship') {
    tierBadge = `<span class="rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">👑 ${escHtml(sType)}</span>`;
  } else if (sType.includes('Star') || sType.includes('Power') || sType.includes('Top Rated') || sType.includes('Authorized')) {
    tierBadge = `<span class="rounded px-1.5 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200">⭐ ${escHtml(sType)}</span>`;
  } else if (sType === 'Regular Seller') {
    tierBadge = `<span class="rounded px-1.5 py-0.5 text-[11px] font-medium bg-gray-50 text-gray-500 border border-gray-200">Toko reguler</span>`;
  } else if (sType) {
    tierBadge = `<span class="rounded px-1.5 py-0.5 text-[11px] font-medium bg-gray-50 text-gray-600 border border-gray-200">${escHtml(sType)}</span>`;
  }

  // Scrape date display if available
  const captureDateBadge = offer.scrape_date
    ? `<span class="text-[11px] text-gray-400">Diperiksa ${formatCaptureDate(offer.scrape_date)}</span>`
    : '';

  div.innerHTML = `
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap mb-1">
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${mpStyle.badge}">
          <span class="h-2 w-2 rounded-full ${mpStyle.dot}"></span>
          ${escHtml(mpLabel)}
        </span>
        ${cheapestBadge}
        ${subAttr}
      </div>
      <div class="mt-1 flex items-center gap-2 flex-wrap">
        <span class="font-medium text-sm text-gray-900">${escHtml(offer.store_name || 'Toko Marketplace')}</span>
        ${tierBadge}
        ${captureDateBadge ? `<span class="text-xs text-gray-300">·</span> ${captureDateBadge}` : ''}
      </div>
    </div>
    <div class="flex-shrink-0 text-right">
      <p class="text-base font-bold text-gray-900">${escHtml(offer.price_fmt)}</p>
      ${linkHref ? `
      <a
        href="${escHtml(linkHref)}"
        target="_blank"
        rel="noopener noreferrer nofollow"
        class="mt-1 inline-flex items-center text-xs text-teal-600 hover:text-teal-700 font-semibold"
      >
        Cek harga <svg class="ml-0.5 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
      </a>` : '<span class="text-xs text-gray-300">URL tidak tersedia</span>'}
    </div>
  `;

  return div;
}

// ---------- Helpers ----------

function showError(msg: string): void {
  skeleton.classList.add('hidden');
  errorEl.classList.remove('hidden');
  errorMsg.textContent = msg;
}

function escHtml(s: string | undefined | null): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ---------- Entry ----------

const productId = getProductId();
if (productId) {
  loadProduct(productId);
} else {
  showError('ID produk tidak ditemukan. Coba akses melalui halaman katalog.');
}
