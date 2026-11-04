/**
 * catalog.ts — Client-side catalog page logic
 *
 * Responsibilities:
 * 1. Fetch paginated card data (api/catalog/page_N.json)
 * 2. Lazy-load search index on first search keystroke
 * 3. Targeted batch fetching for search:
 *    Matches IDs via search_index, looks up their page numbers,
 *    and fetches ONLY the specific catalog pages needed for the visible batch.
 *    NO empty placeholder cards!
 * 4. User can pick variant and compare marketplace choices DIRECTLY from the card:
 *    - Updates price
 *    - Updates marketplace pills (Tokopedia, Shopee, Blibli, Lazada) with prices & links
 *    - Carries selected variant through ?v= to the detail page
 * 5. Category filter & mobile filter drawer
 */

import type { ProductCard, CatalogPage, SearchEntry, CanonicalVariant, VariantMarketplaceOffer } from '../types.ts';
import {pickerOptions} from './variant-picker.mjs';
import {formatCaptureDate} from './capture-dates.mjs';

const PAGE_SIZE = 24;

// Marketplace brand config
const MP_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  tokopedia: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-600' },
  shopee:    { bg: 'bg-orange-50',  text: 'text-orange-800',  border: 'border-orange-300',  dot: 'bg-orange-600' },
  blibli:    { bg: 'bg-sky-50',     text: 'text-sky-800',     border: 'border-sky-300',     dot: 'bg-sky-600' },
  lazada:    { bg: 'bg-indigo-50',  text: 'text-indigo-800',  border: 'border-indigo-300',  dot: 'bg-indigo-600' },
};

function getMpStyle(mpName: string) {
  const key = mpName.toLowerCase();
  return MP_COLORS[key] || { bg: 'bg-gray-50', text: 'text-gray-800', border: 'border-gray-200', dot: 'bg-gray-500' };
}

// ---------- State ----------

let currentPage = 1;
let totalPages = 1;
const allPages: Record<number, ProductCard[]> = {};
const allPagesById: Record<string, ProductCard> = {};

let renderedCards: ProductCard[] = [];
let searchIndex: SearchEntry[] | null = null;
let searchIndexLoading = false;
const currentFilter = { query: '', category: '' };
let isSearchMode = false;
let matchedSearchEntries: SearchEntry[] = [];
let searchOffset = 0;

// ---------- DOM refs ----------

const grid = document.getElementById('card-grid')!;
const countEl = document.getElementById('results-count')!;
const loadMoreSection = document.getElementById('load-more-section')!;
const loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement | null;
const emptyState = document.getElementById('empty-state')!;
const errorState = document.getElementById('error-state')!;
const errorMsg = document.getElementById('error-message')!;
const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
const dataNotice = document.getElementById('data-notice')!;

// ---------- Data fetching ----------

async function fetchPage(page: number): Promise<CatalogPage | null> {
  if (allPages[page]) {
    return { page, total_pages: totalPages, total_products: 0, page_size: PAGE_SIZE, products: allPages[page] };
  }
  try {
    const res = await fetch(`/api/catalog/page_${page}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: CatalogPage = await res.json();
    allPages[page] = data.products;
    totalPages = data.total_pages;
    for (const card of data.products) {
      allPagesById[card.id] = card;
    }
    return data;
  } catch {
    return null;
  }
}

/** Fetch only the specific catalog pages needed for the given search entries */
async function ensurePagesForEntries(entries: SearchEntry[]): Promise<void> {
  const neededPageNums = [...new Set(entries.map(e => e.page))].filter(p => !allPages[p]);
  if (neededPageNums.length === 0) return;
  await Promise.all(neededPageNums.map(p => fetchPage(p)));
}

async function ensureSearchIndex(): Promise<boolean> {
  if (searchIndex) return true;
  if (searchIndexLoading) return false;
  searchIndexLoading = true;
  try {
    const res = await fetch('/api/search_index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    searchIndex = await res.json();
    return true;
  } catch {
    searchIndexLoading = false;
    return false;
  }
}

// ---------- Search / filter ----------

function matchesQuery(entry: SearchEntry, query: string): boolean {
  if (!query) return true;
  const lq = query.toLowerCase();
  return entry.title.toLowerCase().includes(lq);
}

function matchesCategory(entry: SearchEntry, category: string): boolean {
  if (!category) return true;
  return entry.category === category;
}

async function performSearch(): Promise<void> {
  const { query, category } = currentFilter;

  if (!query && !category) {
    // Reset to normal paginated mode
    isSearchMode = false;
    matchedSearchEntries = [];
    searchOffset = 0;
    renderedCards = [];
    grid.innerHTML = '';
    currentPage = 1;
    await loadNextPage();
    return;
  }

  isSearchMode = true;
  dataNotice.classList.remove('hidden');

  const loaded = await ensureSearchIndex();
  if (!loaded || !searchIndex) {
    setError('Gagal memuat indeks pencarian');
    return;
  }

  // Filter search entries
  matchedSearchEntries = searchIndex.filter(
    e => matchesCategory(e, category) && matchesQuery(e, query)
  );

  searchOffset = 0;
  grid.innerHTML = '';
  renderedCards = [];
  await renderSearchBatch();
}

async function renderSearchBatch(): Promise<void> {
  const batchEntries = matchedSearchEntries.slice(searchOffset, searchOffset + PAGE_SIZE);
  if (batchEntries.length === 0) {
    if (searchOffset === 0) showEmpty();
    else loadMoreSection.classList.add('hidden');
    return;
  }

  // Targeted fetch of ONLY the pages containing these batch entries
  await ensurePagesForEntries(batchEntries);

  const batchCards: ProductCard[] = batchEntries
    .map(e => allPagesById[e.id])
    .filter((c): c is ProductCard => Boolean(c));

  appendCards(batchCards);
  renderedCards.push(...batchCards);
  searchOffset += PAGE_SIZE;

  updateCount(renderedCards.length, matchedSearchEntries.length, true);

  const hasMore = searchOffset < matchedSearchEntries.length;
  if (hasMore) {
    loadMoreSection.classList.remove('hidden');
    if (loadMoreBtn) {
      loadMoreBtn.textContent = `Muat ${Math.min(PAGE_SIZE, matchedSearchEntries.length - searchOffset)} produk lagi`;
    }
  } else {
    loadMoreSection.classList.add('hidden');
  }
}

// ---------- Pagination ----------

async function loadNextPage(): Promise<void> {
  if (isSearchMode) {
    await renderSearchBatch();
    return;
  }

  const data = await fetchPage(currentPage);
  if (!data) {
    if (renderedCards.length === 0) {
      setError('Gagal memuat katalog. Pastikan file API sudah di-generate: npm run gen-api');
    }
    return;
  }

  const cards = data.products;
  if (cards.length === 0 && renderedCards.length === 0) {
    showEmpty();
    return;
  }

  appendCards(cards);
  renderedCards.push(...cards);

  updateCount(renderedCards.length);

  const hasMore = currentPage < totalPages;
  if (hasMore) {
    loadMoreSection.classList.remove('hidden');
    if (loadMoreBtn) loadMoreBtn.textContent = 'Muat lebih banyak';
  } else {
    loadMoreSection.classList.add('hidden');
  }

  currentPage++;
}

// ---------- Card rendering ----------

function appendCards(cards: ProductCard[]): void {
  const skeletons = grid.querySelectorAll('[data-skeleton]');
  skeletons.forEach(s => s.remove());

  if (renderedCards.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.add('hidden');
    errorState.classList.add('hidden');
  }

  for (const card of cards) {
    const el = createCardElement(card);
    grid.appendChild(el);
  }
}

function renderMarketplacePills(marketplaces: VariantMarketplaceOffer[] | undefined): string {
  if (!marketplaces || marketplaces.length === 0) {
    return '<span class="text-xs text-gray-400 italic">Belum ada toko yang menjual varian ini</span>';
  }
  return marketplaces.map(mp => {
    const style = getMpStyle(mp.marketplace);
    const sub = mp.sub_attribute && mp.sub_attribute.toLowerCase() !== 'standar'
      ? `<span class="opacity-75 font-normal">· ${escHtml(mp.sub_attribute)}</span>`
      : '';
    return `
      <a
        href="${escHtml(mp.url || '#')}"
        target="_blank"
        rel="noopener noreferrer nofollow"
        onclick="event.stopPropagation()"
        class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border ${style.bg} ${style.text} ${style.border} hover:opacity-90 transition-opacity"
        title="${escHtml(mp.marketplace)}: ${escHtml(mp.price_fmt)}"
      >
        <span class="h-1.5 w-1.5 rounded-full ${style.dot} flex-shrink-0"></span>
        <span>${escHtml(mp.marketplace)}</span>
        <span class="font-bold">${escHtml(mp.price_fmt)}</span>
        ${sub}
      </a>
    `;
  }).join('');
}

function createCardElement(card: ProductCard): HTMLElement {
  const div = document.createElement('div');
  div.className = 'product-card rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col justify-between';
  div.dataset.id = card.id;

  const variants = pickerOptions(card.canonical_variants ?? []).options;
  const selectedVariant = variants.find(v => v.variant_name === card.cheapest_variant || v.member_keys?.includes(card.cheapest_variant)) ?? variants[0];
  const initialVName = selectedVariant?.variant_name ?? '';
  div.dataset.selectedVariant = initialVName;

  const hasOffers = (selectedVariant?.offers_count ?? 0) > 0;
  const detailUrl = `/product/?id=${encodeURIComponent(card.id)}${initialVName ? `&v=${encodeURIComponent(initialVName)}` : ''}`;

  div.innerHTML = `
    <div>
      <a href="${detailUrl}" class="block p-4 pb-0" data-detail-link aria-label="${escHtml(card.title)}">
        <div class="relative mb-3 h-40 overflow-hidden rounded-lg bg-gray-50 flex items-center justify-center">
          ${card.thumbnail
            ? `<img
                 src="${escHtml(card.thumbnail)}"
                 alt="${escHtml(card.title)}"
                 loading="lazy"
                 class="h-full w-full object-contain p-2 transition-opacity duration-300"
                 onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'"
               />
               <div class="img-placeholder hidden absolute inset-0 items-center justify-center text-xs text-gray-400">Gambar tidak tersedia</div>`
            : `<div class="img-placeholder w-full h-full flex items-center justify-center text-xs text-gray-400">Gambar tidak tersedia</div>`
          }
        </div>
        <h3 class="line-clamp-2 text-sm font-semibold text-gray-900 leading-snug">${escHtml(card.title)}</h3>
        <p class="mt-0.5 text-xs text-gray-500">${escHtml(card.category)}</p>
        <div class="mt-2 flex flex-wrap gap-1">${(card.trend_badges ?? [])
          .filter(b => Date.parse(b.valid_until) > Date.now())
          .map(b => `<span class="rounded-full bg-teal-50 px-2 py-1 text-xs text-teal-800">${escHtml(b.label)}</span>`).join('')}</div>
      </a>

      <!-- Variant chips (clickable without opening detail) -->
      ${variants.length > 1 ? `
      <div class="mt-3 px-4 flex flex-wrap gap-1.5" aria-label="Pilih varian">
        ${variants.slice(0, 4).map(v => {
          const isOutOfStock = v.offers_count === 0;
          return `
            <button
              type="button"
              data-variant="${escHtml(v.variant_name)}"
              class="variant-chip ${v.variant_name === initialVName ? 'active' : ''} ${isOutOfStock ? 'opacity-70 border-dashed' : ''}"
              onclick="event.stopPropagation();window.znavvySelectVariant(this, ${escHtml(JSON.stringify(v))})"
              title="${isOutOfStock ? 'Belum ada toko yang menjual varian ini' : (v.cheapest_price_fmt ?? '')}"
            >${escHtml(v.display_name || v.variant_name)}</button>
          `;
        }).join('')}
        ${variants.length > 4 ? `<span class="text-xs text-gray-400 self-center">+${variants.length - 4}</span>` : ''}
      </div>` : ''}
    </div>

    <!-- Price, Marketplace Choices & CTA -->
    <div class="px-4 pb-4 mt-3 pt-2 border-t border-gray-100">
      <div class="flex items-baseline justify-between gap-1">
        <span class="js-price-label text-xs text-gray-500">${hasOffers ? 'mulai' : 'status'}</span>
        <span class="js-price text-base font-bold ${hasOffers ? 'text-teal-700' : 'text-gray-400 font-medium'}">${escHtml(hasOffers ? (selectedVariant?.cheapest_price_fmt ?? card.promo_price) : card.verification_status === 'awaiting_refresh' ? 'Harga sedang diperbarui' : 'Belum ada harga terverifikasi')}</span>
      </div>
      <div class="js-card-date mt-0.5 text-[11px] text-gray-400">
        ${hasOffers && (selectedVariant?.scrape_date || card.scrape_date) ? `Diperiksa ${formatCaptureDate(selectedVariant?.scrape_date || card.scrape_date)}` : 'Tanggal pemeriksaan belum tersedia'}
      </div>

      <!-- Marketplace options directly visible on card -->
      <div class="mt-2">
        <p class="text-[11px] text-gray-400 mb-1">Pilihan Marketplace:</p>
        <div class="js-marketplaces flex flex-wrap gap-1">
          ${renderMarketplacePills(selectedVariant?.marketplaces)}
        </div>
      </div>

      <div class="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span class="js-offers-summary">${card.total_offers} penawaran</span>
        ${variants.length > 1 ? `<span>${variants.length} varian</span>` : ''}
      </div>

      <a
        href="${detailUrl}"
        data-detail-link
        class="js-cta-btn mt-3 flex items-center justify-center rounded-lg py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-500 ${hasOffers ? 'bg-teal-600 text-white hover:bg-teal-700' : 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}"
      >
        ${hasOffers ? 'Lihat detail & semua toko →' : 'Cek ketersediaan di detail →'}
      </a>
    </div>
  `;

  return div;
}

// Global variant chip handler — called inline
(window as unknown as Record<string, unknown>)['znavvySelectVariant'] = (
  btn: HTMLButtonElement,
  variant: CanonicalVariant
): void => {
  const card = btn.closest('[data-id]') as HTMLElement;
  if (!card) return;

  // Toggle active chip
  card.querySelectorAll('.variant-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');

  // Remember selected variant on card
  card.dataset.selectedVariant = variant.variant_name;

  const hasOffers = (variant.offers_count ?? 0) > 0;

  // Update price display & label
  const priceEl = card.querySelector('.js-price') as HTMLElement;
  const priceLabel = card.querySelector('.js-price-label') as HTMLElement;
  if (priceEl) {
    if (hasOffers) {
      priceEl.textContent = variant.cheapest_price_fmt ?? '';
      priceEl.className = 'js-price text-base font-bold text-teal-700';
      if (priceLabel) priceLabel.textContent = 'mulai';
    } else {
      priceEl.textContent = 'Tidak tersedia';
      priceEl.className = 'js-price text-base font-medium text-gray-400';
      if (priceLabel) priceLabel.textContent = 'status';
    }
  }

  // Update capture date for this specific variant
  const dateEl = card.querySelector('.js-card-date') as HTMLElement;
  if (dateEl) {
    if (hasOffers && variant.scrape_date) {
      dateEl.textContent = `Diperiksa ${formatCaptureDate(variant.scrape_date)}`;
    } else {
      dateEl.textContent = 'Tanggal pemeriksaan belum tersedia';
    }
  }

  // Update marketplace pills for this specific variant
  const mpContainer = card.querySelector('.js-marketplaces') as HTMLElement;
  if (mpContainer) {
    mpContainer.innerHTML = renderMarketplacePills(variant.marketplaces);
  }

  // Update CTA button styling and label
  const ctaBtn = card.querySelector('.js-cta-btn') as HTMLAnchorElement;
  if (ctaBtn) {
    if (hasOffers) {
      ctaBtn.className = 'js-cta-btn mt-3 flex items-center justify-center rounded-lg py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-500 bg-teal-600 text-white hover:bg-teal-700';
      ctaBtn.textContent = 'Lihat detail & semua toko →';
    } else {
      ctaBtn.className = 'js-cta-btn mt-3 flex items-center justify-center rounded-lg py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-teal-500 border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100';
      ctaBtn.textContent = 'Cek ketersediaan di detail →';
    }
  }

  // Update ALL detail links on this card to preserve ?v= parameter
  const cardId = card.dataset.id ?? '';
  const newUrl = `/product/?id=${encodeURIComponent(cardId)}&v=${encodeURIComponent(variant.variant_name)}`;
  card.querySelectorAll<HTMLAnchorElement>('[data-detail-link]').forEach(a => {
    a.href = newUrl;
  });
};

// ---------- UI helpers ----------

function updateCount(shown: number, total?: number, isSearch?: boolean): void {
  if (isSearch && total !== undefined) {
    countEl.textContent = `${total} produk ditemukan — menampilkan ${shown}`;
  } else {
    countEl.textContent = `Menampilkan ${shown} produk`;
  }
}

function showEmpty(): void {
  grid.innerHTML = '';
  emptyState.classList.remove('hidden');
  countEl.textContent = '0 produk ditemukan';
  loadMoreSection.classList.add('hidden');
  const requestKeyword = document.getElementById('request-keyword') as HTMLInputElement | null;
  if (requestKeyword) requestKeyword.value = currentFilter.query;
}

function setError(msg: string): void {
  grid.innerHTML = '';
  errorState.classList.remove('hidden');
  errorMsg.textContent = msg;
  loadMoreSection.classList.add('hidden');
  countEl.textContent = '';
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Event listeners ----------

// Search input with debounce
let searchDebounce: ReturnType<typeof setTimeout>;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    currentFilter.query = searchInput.value.trim();
    renderedCards = [];
    matchedSearchEntries = [];
    performSearch();
  }, 250);
});

// Category filter buttons
document.getElementById('category-filter')?.addEventListener('click', event => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.cat-btn');
    if (!btn) return;
    document.querySelectorAll('.cat-btn').forEach(b => {
      b.classList.remove('active', 'border-teal-500', 'bg-teal-50', 'text-teal-700');
      b.classList.add('border-gray-200', 'text-gray-600');
    });
    btn.classList.add('active', 'border-teal-500', 'bg-teal-50', 'text-teal-700');
    btn.classList.remove('border-gray-200', 'text-gray-600');

    currentFilter.category = (btn as HTMLElement).dataset.cat ?? '';
    renderedCards = [];
    matchedSearchEntries = [];
    isSearchMode = false;
    grid.innerHTML = '';
    currentPage = 1;

    if (!currentFilter.category) {
      dataNotice.classList.add('hidden');
      loadNextPage();
    } else {
      performSearch();
    }
});

// Use actual exported labels, not a second hard-coded taxonomy in the page.
fetch(new URL('api/search_index.json', document.baseURI)).then(r => {
  if (!r.ok) throw Error('category_index_unavailable');
  return r.json();
}).then(data => {
  const entries = Array.isArray(data) ? data : data.entries;
  if (!Array.isArray(entries)) return;
  const categories = [...new Set(entries.map((e: {category?: string}) => e.category).filter((c): c is string => typeof c === 'string' && !!c))].sort();
  const container = document.getElementById('category-filter');
  if (!container || !categories.length) return;
  container.querySelectorAll('.cat-btn:not([data-cat=""])').forEach(b => b.remove());
  for (const category of categories) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.cat = category; button.textContent = category;
    button.className = 'cat-btn rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-gray-600 hover:border-teal-400 hover:text-teal-700';
    container.append(button);
  }
}).catch(() => { /* Existing snapshot filters remain usable on load failure. */ });

// Load More button
loadMoreBtn?.addEventListener('click', async () => {
  const btn = loadMoreBtn as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Memuat…';
  if (isSearchMode) {
    await renderSearchBatch();
  } else {
    await loadNextPage();
  }
  btn.disabled = false;
});

// ---------- Initial load ----------
(async () => {
  const data = await fetchPage(1);
  if (!data) {
    setError('Gagal memuat katalog. Pastikan file API sudah di-generate dengan: npm run gen-api');
    return;
  }
  grid.innerHTML = '';
  appendCards(data.products);
  renderedCards = data.products;
  totalPages = data.total_pages;
  currentPage = 2;

  updateCount(renderedCards.length);

  if (totalPages > 1) {
    loadMoreSection.classList.remove('hidden');
    if (loadMoreBtn) loadMoreBtn.textContent = `Muat lebih banyak (${totalPages - 1} halaman lagi)`;
  }
})();
