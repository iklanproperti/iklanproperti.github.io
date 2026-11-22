const WA_NUMBER = '628212334550';

const GITHUB_CONFIG = {
  owner: 'iklanproperti',
  repo: 'iklanproperti.github.io',
  branch: 'main',
  folder: 'content/properti'
};

let allListings = [];
let currentFiltered = [];

// Parser YAML Frontmatter yang mendukung string, angka, list (- item), maupun inline array (["a", "b"])
function parseFrontmatterClient(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const lines = match[1].split(/\r?\n/);
  const data = {};
  let currentKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Tangani item array YAML (- item atau   - item)
    if (trimmed.startsWith('- ') && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      const itemVal = trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '');
      data[currentKey].push(itemVal);
      continue;
    }

    const idx = line.indexOf(':');
    if (idx !== -1) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      currentKey = key;

      if (val === '') {
        data[key] = [];
      } else if (val.startsWith('[') && val.endsWith(']')) {
        // Tangani inline array: ["A", "B"]
        const inner = val.slice(1, -1).trim();
        data[key] = inner
          ? inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
          : [];
      } else {
        val = val.replace(/^["']|["']$/g, '');
        if (!isNaN(val) && val !== '') val = Number(val);
        data[key] = val;
      }
    }
  }

  return { data, body: match[2].trim() };
}

// Ubah markdown sederhana pada body deskripsi menjadi HTML rapi
function formatBodyHtml(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

// Resolusi path gambar dari Pages CMS ke URL raw GitHub
function resolveImageUrl(rawImg) {
  if (!rawImg) return '';
  if (rawImg.startsWith('http://') || rawImg.startsWith('https://')) return rawImg;

  const cleanPath = rawImg.replace(/^\/+/, '');
  return `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${encodeURI(cleanPath)}`;
}

function getFeaturedImage(item) {
  const rawImg = item.gambar_utama || item.coverImage || item.thumbnail || item.image || item.foto || '';
  return resolveImageUrl(rawImg);
}

// Ambil seluruh postingan .md langsung dari folder Pages CMS di GitHub
async function fetchFromPagesCMS() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.folder}?ref=${GITHUB_CONFIG.branch}&t=${Date.now()}`;
  const res = await fetch(apiUrl);
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const files = await res.json();
  if (!Array.isArray(files)) return [];

  const mdFiles = files.filter(f => f.name.endsWith('.md'));
  const items = await Promise.all(
    mdFiles.map(async f => {
      const mdRes = await fetch(`${f.download_url}?t=${Date.now()}`);
      const text = await mdRes.text();
      const { data, body } = parseFrontmatterClient(text);
      return {
        slug: f.name.replace(/\.md$/, ''),
        ...data,
        deskripsi: body
      };
    })
  );

  return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

async function loadListings() {
  const count = document.getElementById('listingCount');
  if (count) count.textContent = 'Menyinkronkan listing dari Pages CMS...';

  // 1. Ambil langsung dari folder content/properti Pages CMS di GitHub
  try {
    const cmsData = await fetchFromPagesCMS();
    if (cmsData && cmsData.length > 0) {
      allListings = cmsData;
      currentFiltered = [...allListings];
      renderListings(currentFiltered);
      return;
    }
  } catch (e) {
    console.warn('Gagal mengambil langsung dari GitHub API, beralih ke data/listings.json:', e);
  }

  // 2. Fallback ke data/listings.json jika tersedia
  try {
    const res = await fetch(`data/listings.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        allListings = data;
        currentFiltered = [...allListings];
        renderListings(currentFiltered);
        return;
      }
    }
  } catch (e) {
    console.warn('Gagal memuat data/listings.json:', e);
  }

  // 3. Jika belum ada postingan
  allListings = [];
  currentFiltered = [];
  renderListings([]);
}

function renderListings(items) {
  const grid = document.getElementById('listingGrid');
  const count = document.getElementById('listingCount');
  if (count) count.textContent = `Menampilkan ${items.length} properti`;

  if (items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 48px 20px; background: #fff; border-radius: 12px; border: 1px solid #e6e2da;">
        <h3 style="color: var(--navy); margin-bottom: 8px;">Belum Ada Listing Properti</h3>
        <p style="color: var(--gray-text); margin-bottom: 16px;">Tambahkan postingan properti baru melalui Pages CMS pada folder <code>content/properti</code>, lalu muat ulang halaman ini.</p>
        <button class="btn-filter" onclick="resetFilters()">Muat Ulang Listing</button>
      </div>`;
    return;
  }

  grid.innerHTML = items.map((item, idx) => {
    const isKavling = (item.kategori || '').toLowerCase().includes('kavling');
    const statusClass = item.status === 'Terjual' ? 'terjual' : '';
    const imgUrl = getFeaturedImage(item);
    const waText = encodeURIComponent(
      `Halo Widy, saya tertarik dengan properti "${item.title}" (${item.harga}) di ${item.lokasi}. Boleh minta info detail & jadwal survey?`
    );

    const spec3 = isKavling
      ? `<div class="spec-item"><strong>Siap Bangun</strong>Kondisi Lahan</div>`
      : `<div class="spec-item"><strong>${item.kamar_tidur || '-'} KT / ${item.kamar_mandi || '-'} KM</strong>Ruangan</div>`;

    return `
      <article class="property-card">
        <div class="card-image">
          ${imgUrl ? `<img src="${imgUrl}" alt="${item.title}" loading="lazy" />` : ''}
          <div class="badge-group">
            <span class="badge badge-kategori">${item.kategori || 'Properti'}</span>
            <span class="badge badge-status ${statusClass}">${item.status || 'Tersedia'}</span>
          </div>
          <span class="badge-legalitas">${item.legalitas || 'SHM'}</span>
        </div>
        <div class="card-body">
          <div class="card-price">${item.harga || '-'}</div>
          <h3 class="card-title">${item.title || 'Tanpa Judul'}</h3>
          <div class="card-location">&#128205; ${item.lokasi || '-'}</div>
          <div class="card-specs">
            <div class="spec-item"><strong>${item.luas_tanah ? item.luas_tanah + ' m²' : '-'}</strong>Luas Tanah</div>
            <div class="spec-item"><strong>${isKavling ? 'Datar' : (item.luas_bangunan ? item.luas_bangunan + ' m²' : '-')}</strong>${isKavling ? 'Kontur' : 'Bangunan'}</div>
            ${spec3}
          </div>
          <div class="card-actions">
            <button class="btn-detail" onclick="openModal(${idx})">Detail Unit</button>
            <a href="https://wa.me/${WA_NUMBER}?text=${waText}" target="_blank" rel="noopener" class="btn-wa">Booking / Survey</a>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function applyFilters() {
  const keyword = document.getElementById('searchInput').value.toLowerCase().trim();
  const kategori = document.getElementById('kategoriFilter').value;
  const status = document.getElementById('statusFilter').value;

  document.querySelectorAll('.chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.kat === kategori);
  });

  currentFiltered = allListings.filter(item => {
    const matchKeyword =
      !keyword ||
      (item.title && item.title.toLowerCase().includes(keyword)) ||
      (item.lokasi && item.lokasi.toLowerCase().includes(keyword)) ||
      (item.deskripsi && item.deskripsi.toLowerCase().includes(keyword));
    const matchKategori = !kategori || item.kategori === kategori;
    const matchStatus = !status || item.status === status;
    return matchKeyword && matchKategori && matchStatus;
  });

  renderListings(currentFiltered);
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('kategoriFilter').value = '';
  document.getElementById('statusFilter').value = '';
  document.querySelectorAll('.chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.kat === '');
  });
  loadListings();
}

function openModal(idx) {
  const item = currentFiltered[idx];
  if (!item) return;

  const isKavling = (item.kategori || '').toLowerCase().includes('kavling');
  const mainImg = getFeaturedImage(item);
  const waText = encodeURIComponent(
    `Halo Widy, saya ingin jadwalkan survey untuk "${item.title}" (${item.harga}) di ${item.lokasi}.`
  );

  const galeriHtml =
    Array.isArray(item.galeri) && item.galeri.length > 0
      ? `<div class="modal-gallery">
          ${mainImg ? `<img src="${mainImg}" alt="Utama" onclick="document.getElementById('modalMainImg').src='${mainImg}'" />` : ''}
          ${item.galeri
            .map(g => {
              const gUrl = resolveImageUrl(g);
              return gUrl ? `<img src="${gUrl}" alt="Galeri" onclick="document.getElementById('modalMainImg').src='${gUrl}'" />` : '';
            })
            .join('')}
        </div>`
      : '';

  const fiturHtml =
    Array.isArray(item.fitur_unggulan) && item.fitur_unggulan.length > 0
      ? `<h4 style="color: var(--navy); margin-top: 16px;">Keunggulan Lokasi & Fasilitas:</h4>
         <ul class="modal-features">${item.fitur_unggulan.map(f => `<li>${f}</li>`).join('')}</ul>`
      : '';

  document.getElementById('modalBody').innerHTML = `
    ${mainImg ? `<img src="${mainImg}" alt="${item.title}" class="modal-img" id="modalMainImg" />` : ''}
    ${galeriHtml}
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <span class="badge badge-kategori">${item.kategori || 'Properti'}</span>
      <span class="badge badge-status">${item.status || 'Tersedia'}</span>
    </div>
    <h2 style="color: var(--navy); line-height:1.3; margin-bottom:6px;">${item.title}</h2>
    <div class="card-price">${item.harga}</div>
    <p style="color: var(--gray-text); font-size:0.94rem;">&#128205; ${item.lokasi}</p>

    <div class="modal-specs-box">
      <div><strong>${item.luas_tanah ? item.luas_tanah + ' m²' : '-'}</strong>Luas Tanah</div>
      <div><strong>${isKavling ? 'Siap Bangun' : (item.luas_bangunan ? item.luas_bangunan + ' m²' : '-')}</strong>${isKavling ? 'Kondisi' : 'Luas Bangunan'}</div>
      <div><strong>${isKavling ? 'Cor Beton' : (item.kamar_tidur || '-') + ' KT / ' + (item.kamar_mandi || '-') + ' KM'}</strong>${isKavling ? 'Akses Jalan' : 'Kamar'}</div>
      <div><strong>${item.legalitas || 'SHM'}</strong>Legalitas</div>
    </div>

    <div class="modal-desc">${formatBodyHtml(item.deskripsi)}</div>
    ${fiturHtml}

    <div style="margin-top: 24px;">
      <a href="https://wa.me/${WA_NUMBER}?text=${waText}" target="_blank" rel="noopener" class="btn-wa" style="display:block; padding: 15px; font-size: 1rem; text-align:center;">
        Jadwalkan Survey via WhatsApp (0821 2334 550)
      </a>
    </div>
  `;

  document.getElementById('propertyModal').classList.add('active');
}

function closeModal() {
  document.getElementById('propertyModal').classList.remove('active');
}

function handleBackdropClick(e) {
  if (e.target.id === 'propertyModal') {
    closeModal();
  }
}

// Tutup modal dengan tombol ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// Toggle menu mobile di navbar
const mobileToggle = document.getElementById('mobileToggle');
const navLinks = document.getElementById('navLinks');
if (mobileToggle && navLinks) {
  mobileToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
}

// Event Listener Chip Kategori Cepat
document.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('kategoriFilter').value = btn.dataset.kat;
    applyFilters();
  });
});

// Jalankan filter saat menekan Enter di kotak pencarian
const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('keyup', e => {
    if (e.key === 'Enter') applyFilters();
  });
}

// Muat data listing otomatis saat halaman terbuka
document.addEventListener('DOMContentLoaded', loadListings);
