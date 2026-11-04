// Public endpoint only; never expose local Flask/admin URLs or credentials.
const form = document.getElementById('product-request-form') as HTMLFormElement | null;
const keyword = document.getElementById('request-keyword') as HTMLInputElement | null;
const notes = form?.querySelector('textarea') as HTMLTextAreaElement | null;
const proposal = document.getElementById('product-proposal');
const contact = document.getElementById('request-contact-step');
const interpretStatus = document.getElementById('interpret-status');
let confirmedInput = '';
let proposedName = '';
let proposedDetails = '';
const inputSignature = () => JSON.stringify([keyword?.value.trim(),notes?.value.trim()]);
const resetConfirmation = () => { confirmedInput=''; proposedName=''; proposedDetails=''; if(contact) contact.hidden=true; if(proposal) proposal.hidden=true; };
keyword?.addEventListener('input',resetConfirmation);
notes?.addEventListener('input',resetConfirmation);
document.getElementById('manual-product')?.addEventListener('click',()=>{
  if(!keyword?.value.trim()) {keyword?.focus();return;}
  proposedName=keyword.value.trim();
  proposedDetails='';
  document.getElementById('product-proposal-text')!.textContent=[proposedName,notes?.value.trim()].filter(Boolean).join(' — ');
  interpretStatus!.textContent='Konfirmasi manual — belum dianalisis AI.';
  proposal!.hidden=false;
});
document.getElementById('accept-product')?.addEventListener('click',()=>{
  if(!keyword || !proposedName)return;
  keyword.value=proposedName;
  if(notes && proposedDetails) notes.value=[notes.value.trim(),proposedDetails].filter(Boolean).join('\n').slice(0,1000);
  confirmedInput=inputSignature();contact!.hidden=false;
  proposal!.hidden=true;
});
document.getElementById('revise-product')?.addEventListener('click',()=>{resetConfirmation();keyword?.focus();});
document.getElementById('interpret-product')?.addEventListener('click',async()=>{
  if(!keyword?.value.trim()) {keyword?.focus();return;}
  resetConfirmation();
  const endpoint=form?.dataset.interpretEndpoint;
  if(!endpoint) {interpretStatus!.textContent='Konfirmasi AI belum tersambung. Anda dapat melengkapi detail lalu memilih konfirmasi manual; belum ada permintaan dikirim.';return;}
  const target=new URL(endpoint,location.origin);
  if(target.protocol!=='https:' || target.origin!==location.origin) {interpretStatus!.textContent='Layanan AI belum dikonfigurasi dengan aman.';return;}
  const signature=inputSignature();
  interpretStatus!.textContent='Memperjelas produk…';
  try {
    const response=await fetch(target.href,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({keyword:keyword.value.trim(),notes:notes?.value.trim()}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(inputSignature()!==signature)return;
    if(!response.ok || result.source!=='ai' || typeof result.needs_clarification!=='boolean')throw Error();
    if(result.needs_clarification) {interpretStatus!.textContent=String(result.question || 'Mohon lengkapi model dan varian produk.').slice(0,500);return;}
    if(typeof result.proposed_name!=='string' || !result.proposed_name.trim() || result.proposed_name.length>200)throw Error();
    proposedName=result.proposed_name.trim();
    proposedDetails=[String(result.category || '').slice(0,100),String(result.variant || '').slice(0,200)].filter(Boolean).join(' · ');
    document.getElementById('product-proposal-text')!.textContent=[proposedName,String(result.category || '').slice(0,100),String(result.variant || '').slice(0,200)].filter(Boolean).join(' · ');
    interpretStatus!.textContent='Usulan AI, bukan bukti ketersediaan atau harga. Periksa sebelum melanjutkan.';
    proposal!.hidden=false;
  } catch {interpretStatus!.textContent='Konfirmasi AI belum berhasil. Lengkapi detail atau gunakan konfirmasi manual.';}
});
form?.addEventListener('submit', async event => {
  event.preventDefault();
  if(!confirmedInput || confirmedInput!==inputSignature()) {interpretStatus!.textContent='Konfirmasikan produk terlebih dahulu.';return;}
  if (!form.reportValidity()) return;
  const status = document.getElementById('request-status')!;
  const endpoint = form.dataset.endpoint || '';
  if (!endpoint) {
    status.textContent = 'Layanan permintaan belum diaktifkan. Data Anda belum dikirim atau disimpan.';
    return;
  }
  const target = new URL(endpoint, location.origin);
  if (target.protocol !== 'https:' || target.origin !== location.origin) {
    status.textContent = 'Layanan permintaan belum dikonfigurasi dengan aman. Data belum dikirim.';
    return;
  }
  const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  button.disabled = true;
  status.textContent = 'Mengirim permintaan…';
  const data = new FormData(form);
  try {
    const response = await fetch(target.href, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({keyword: data.get('keyword'), notes: data.get('notes'),
        email: data.get('email'), consent: true}),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true || !result.request_id) throw new Error('not_acknowledged');
    status.textContent = `Permintaan diterima (${result.request_id}). Pemberitahuan email menunggu produk tersedia.`;
  } catch {
    status.textContent = 'Penerimaan permintaan belum dapat dikonfirmasi. Jangan kirim berulang; coba lagi nanti.';
  } finally { button.disabled = false; }
});
