const WA_NUMBER = '628212334550';

// Isi username GitHub & nama repo Anda agar beranda membaca folder content/properti secara real-time
const GITHUB_CONFIG = {
  owner: 'iklanproperti', // Contoh: 'adsmosfer'
  repo: 'iklanproperti.github.io',  // Contoh: 'properti-bandung'
  branch: 'main',
  folder: 'content/properti'
};

let allListings = [];
let currentFiltered = [];

const fallbackListings = [
  {
    title: "Diskon Hemat Rp 94,5 Juta Kavling Investasi Sagaracipta Hanya Rp 850 Ribu/m²",
    harga: "Rp 229,5 Juta (Rp 850 Rb/m²)",
    kategori: "Kavling Tanah",
    status: "Promo",
    lokasi: "Sagaracipta, Ciparay, Bandung",
    luas_tanah: 270,
    luas_bangunan: 0,
    kamar_tidur: 0,
    kamar_mandi: 0,
    legalitas: "SHM Pecah",
    gambar_utama: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
    fitur_unggulan: [
      "Diskon hemat Rp 94,5 Juta dari harga normal Rp 1,2 Juta/m² (Rp 324 Juta)",
      "Kontur tanah datar 270 m², siap langsung bangun tanpa biaya urug",
      "Legalitas SHM sudah pecah per unit, aman dan siap balik nama",
      "Akses jalan sudah dicor beton mulus dan berada di jalur aktif kendaraan",
      "Selangkah menuju SDN Negeri Sagaracipta & Kantor Desa Sagaracipta"
    ],
    deskripsi: "Kesempatan emas memiliki aset tanah kavling luas di kawasan berkembang Sagaracipta, Ciparay dengan potongan diskon spesial.\n\nHarga Normal: Rp 1.200.000/m² (Rp 324.000.000)\nHarga Promo: Rp 850.000/m² (Rp 229.500.000)"
  }
];

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

// Ambil gambar dari berbagai kemungkinan nama field di Pages CMS
function getFeaturedImage(item) {
  const rawImg = item.gambar_utama || item.coverImage || item.thumbnail || item.image || item.foto || '';
  if (!rawImg) {
    return "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80";
  }
  if (rawImg.startsWith("http://") || rawImg.startsWith("https://")) {
    return rawImg;
  }

  const cleanPath = rawImg.replace(/^\/+/, "");

  if (GITHUB_CONFIG.owner && GITHUB_CONFIG.repo) {
    return `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${encodeURI(cleanPath)}`;
  }

  return encodeURI(cleanPath);
}

function resolveGalleryImage(imgPath) {
  if (!imgPath) return '';
  if (imgPath.startsWith("http://") || imgPath.startsWith("https://")) return imgPath;
  const cleanPath = imgPath.replace(/^\/+/, "");
  if (GITHUB_CONFIG.owner && GITHUB_CONFIG.repo) {
    return `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${encodeURI(cleanPath)}`;
  }
  return encodeURI(cleanPath);
}

async function fetchDirectFromGitHub() {
  if (!GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) return null;
  const apiUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.folder}?ref=${GITHUB_CONFIG.branch}&t=${Date.now()}`;
  const res = await fetch(apiUrl);
  if (!res.ok) return null;

  const files = await res.json();
  const mdFiles = files.filter(f => f.name.endsWith('.md'));
  const items = await Promise.all(mdFiles.map(async f => {
    const mdRes = await fetch(f.download_url);
    const text = await mdRes.text();
    const { data, body } = parseFrontmatterClient(text);
    return { slug: f.name.replace(/\.md$/, ''), ...data, deskripsi: body };
  }));

  return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

async function loadListings() {
  try {
    const ghData = await fetchDirectFromGitHub();
    if (ghData && ghData.length > 0) {
      allListings = ghData;
      currentFiltered = [...allListings];
      renderListings(currentFiltered);
      return;
    }
  } catch (e) {}

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
  } catch (e) {}

  allListings = fallbackListings;
  currentFiltered = [...allListings];
  renderListings(currentFiltered);
}

function renderListings(items) {
  const grid = document.getElementById('listingGrid');
  const count = document.getElementById('listingCount');
  count.textContent = `Menampilkan ${items.length} properti`;

  if (items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 48px 20px; background: #fff; border-radius: 12px; border: 1px solid #e6e2da;">
        <h3 style="color: var(--navy); margin-bottom: 8px;">Properti Tidak Ditemukan</h3>
        <p style="color: var(--gray-text); margin-bottom: 16px;">Coba ubah kata kunci lokasi atau reset filter pencarian Anda.</p>
        <button class="btn-filter" onclick="resetFilters()">Tampilkan Semua Properti</button>
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
          <img src="${imgUrl}" alt="${item.title}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80';" />
          <div class="badge-group">
            <span class="badge badge-kategori">${item.kategori || 'Properti'}</span>
            <span class="badge badge-status ${statusClass}">${item.status || 'Tersedia'}</span>
          </div>
          <span class="badge-legalitas">${item.legalitas || 'SHM'}</span>
        </div>
        <div class="card-body">
          <div class="card-price">${item.harga}</div>
          <h3 class="card-title">${item.title}</h3>
          <div class="card-location">&#128205; ${item.lokasi}</div>
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
  applyFilters();
}

function openModal(idx) {
  const item = currentFiltered[idx];
  if (!item) return;

  const isKavling = (item.kategori || '').toLowerCase().includes('kavling');
  const mainImg = getFeaturedImage(item);
  const waText = encodeURIComponent(`Halo Widy, saya ingin jadwalkan survey untuk "${item.title}" (${item.harga}) di ${item.lokasi}.`);

  const galeriHtml = Array.isArray(item.galeri) && item.galeri.length > 0
    ? `<div class="modal-gallery">
        <img src="${mainImg}" alt="Utama" onclick="document.getElementById('modalMainImg').src='${mainImg}'" />
        ${item.galeri.map(g => {
          const gUrl = resolveGalleryImage(g);
          return `<img src="${gUrl}" alt="Galeri" onclick="document.getElementById('modalMainImg').src='${gUrl}'" />`;
        }).join('')}
      </div>`
    : '';

  const fiturHtml = Array.isArray(item.fitur_unggulan) && item.fitur_unggulan.length > 0
    ? `<h4 style="color: var(--navy); margin-top: 16px;">Keunggulan Lokasi & Fasilitas:</h4>
       <ul class="modal-features">${item.fitur_unggulan.map(f => `<li>${f}</li>`).join('')}</ul>`
    : '';

  document.getElementById('modalBody').innerHTML = `
    <img src="${mainImg}" alt="${item.title}" class="modal-img" id="modalMainImg" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80';" />
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

  document.getElementById('propertyModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('propertyModal').classList.remove('active');
  document.body.style.overflow = '';
}

function handleBackdropClick(e) {
  if (e.target.id === 'propertyModal') closeModal();
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('kategoriFilter').addEventListener('change', applyFilters);
document.getElementById('statusFilter').addEventListener('change', applyFilters);

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('kategoriFilter').value = chip.dataset.kat;
    applyFilters();
  });
});

document.getElementById('mobileToggle').addEventListener('click', () => {
  document.getElementById('navLinks').classList.toggle('open');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

loadListings();
