const WA_NUMBER = '628212334550';

// Deteksi otomatis username GitHub & nama repo dari URL GitHub Pages (*.github.io/nama-repo/)
// Jika memakai custom domain, isi manual owner dan repo di bawah ini.
function detectGitHubRepo() {
  const host = window.location.hostname;
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (host.endsWith('.github.io')) {
    const owner = host.replace('.github.io', '');
    const repo = pathParts.length > 0 ? pathParts[0] : `${owner}.github.io`;
    return { owner, repo };
  }
  return { owner: '', repo: '' };
}

const detected = detectGitHubRepo();
const GITHUB_CONFIG = {
  owner: detected.owner || 'iklanproperti', // Isi manual jika pakai custom domain (misal: 'adsmosfer')
  repo: detected.repo || 'iklanproperti.github.io',   // Isi manual jika pakai custom domain (misal: 'properti-bandung')
  branch: 'main',
  folder: 'content/properti'
};

let allListings = [];
let currentFiltered = [];

function parseFrontmatterClient(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const lines = match[1].split(/\r?\n/);
  const data = {};
  let currentKey = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (line.startsWith('  - ') && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(line.replace('  - ', '').trim().replace(/^["']|["']$/g, ''));
    } else {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        currentKey = key;
        if (val === '') {
          data[key] = [];
        } else {
          val = val.replace(/^["']|["']$/g, '');
          if (!isNaN(val) && val !== '') val = Number(val);
          data[key] = val;
        }
      }
    }
  }
  return { data, body: match[2].trim() };
}

// Ambil gambar dari field Pages CMS (gambar_utama / coverImage / thumbnail)
function getFeaturedImage(item) {
  const rawImg = item.gambar_utama || item.coverImage || item.thumbnail || item.image || item.foto || '';
  if (!rawImg) return '';
  if (rawImg.startsWith('http://') || rawImg.startsWith('https://')) return rawImg;

  const cleanPath = rawImg.replace(/^\/+/, '');
  if (GITHUB_CONFIG.owner && GITHUB_CONFIG.repo) {
    return `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${encodeURI(cleanPath)}`;
  }
  return encodeURI(cleanPath);
}

function resolveGalleryImage(imgPath) {
  if (!imgPath) return '';
  if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) return imgPath;
  const cleanPath = imgPath.replace(/^\/+/, '');
  if (GITHUB_CONFIG.owner && GITHUB_CONFIG.repo) {
    return `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${encodeURI(cleanPath)}`;
  }
  return encodeURI(cleanPath);
}

// Ambil seluruh postingan .md langsung dari folder Pages CMS di GitHub
async function fetchFromPagesCMS() {
  if (!GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) return null;

  const apiUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.folder}?ref=${GITHUB_CONFIG.branch}&t=${Date.now()}`;
  const res = await fetch(apiUrl);
  if (!res.ok) return null;

  const files = await res.json();
  if (!Array.isArray(files)) return null;

  const mdFiles = files.filter(f => f.name.endsWith('.md'));
  const items = await Promise.all(mdFiles.map(async f => {
    const mdRes = await fetch(`${f.download_url}?t=${Date.now()}`);
    const text = await mdRes.text();
    const { data, body } = parseFrontmatterClient(text);
    return { slug: f.name.replace(/\.md$/, ''), ...data, deskripsi: body };
  }));

  return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

async function loadListings() {
  const count = document.getElementById('listingCount');
  count.textContent = 'Menyinkronkan listing dari Pages CMS...';

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

  // 2. Fallback ke data/listings.json hasil build Node.js dari postingan Pages CMS
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

  // 3. Jika belum ada satu pun postingan di Pages CMS
  allListings = [];
  currentFiltered = [];
  renderListings([]);
}

function renderListings(items) {
  const grid = document.getElementById('listingGrid');
  const count = document.getElementById('listingCount');
  count.textContent = `Menampilkan ${items.length} properti`;

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
    const waText = encodeURIComponent(`Halo Widy, saya tertarik dengan properti "${item.title}" (${item.harga}) di ${item.lokasi}. Boleh minta info detail & jadwal survey?`);

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
    const matchKeyword = !keyword ||
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
  loadListings();
}

function openModal(idx) {
  const item = currentFiltered[idx];
  if (!item) return;

  const isKavling = (item.kategori || '').toLowerCase().includes('kavling');
  const mainImg = getFeaturedImage(item);
  const waText = encodeURIComponent(`Halo Widy, saya ingin jadwalkan survey untuk "${item.title}" (${item.harga}) di ${item.lokasi}.`);

  const galeriHtml = Array.isArray(item.galeri) && item.galeri.length > 0
    ? `<div class="modal-gallery">
        ${mainImg ? `<img src="${mainImg}" alt="Utama" onclick="document.getElementById('modalMainImg').src='${mainImg}'" />` : ''}
        ${item.galeri.map(g => {
          const gUrl = resolveGalleryImage(g);
          return gUrl ? `<img src="${gUrl}" alt="Galeri" onclick="document.getElementById('modalMainImg').src='${gUrl}'" />` : '';
        }).join('')}
      </div>`
    : '';

  const fiturHtml = Array.isArray(item.fitur_unggulan) && item.fitur_unggulan.length > 0
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

    <div class="modal-desc">${item.deskripsi || ''}</div>
    ${fiturHtml}

    <div style="margin-top: 24px;">
      <a href="https://wa.me/${WA_NUMBER}?text=${waText}" target="_blank" rel="noopener" class="btn-wa" style="display:block; padding: 15px; font-size: 1rem;">
        Jadwalkan Survey via WhatsApp (0821 2334 550)
      </a>
    </div>
  `;

  document.getElementById('propertyModal').classList
