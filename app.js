import { db } from './firebase-config.js';
import { 
    collection, getDoc, doc, setDoc, updateDoc, serverTimestamp, query, getDocs, where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const strukturOrganisasi = {
    "DAERAH": ["KYAI DAE", "WAKIL KYAI DAE", "MUBALIGH DAE"],
    "DESA_JABATAN": ["KYAI DESA", "MUBALIGH DESA"],
    "WILAYAH": {
        "WATES": ["KREMBANGAN", "BOJONG", "GIRIPENI 1", "GIRIPENI 2", "HARGOWILIS", "TRIHARJO"],
        "PENGASIH": ["MARGOSARI", "SENDANGSARI", "BANJARHARJO", "NANGGULAN", "GIRINYONO", "JATIMULYO", "SERUT"],
        "TEMON": ["TAWANGSARI", "HARGOREJO", "SIDATAN 1", "SIDATAN 2", "JOGOBOYO", "JOGORESAN"],
        "LENDAH": ["BONOSORO", "BUMIREJO", "CARIKAN", "NGENTAKREJO", "TUKSONO", "SRIKAYANGAN"],
        "SAMIGALUH": ["PENGOS", "SUREN", "KALIREJO", "PAGERHARJO", "SEPARANG", "KEBONHARJO"]
    }
};

let html5QrCode;

// --- 1. LOGIN ---
window.showLoginPanitia = () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <h2 style="margin-top:0; color:#0056b3;">Login Panitia Asrama</h2>
        <input type="password" id="pass-panitia" placeholder="Masukkan Sandi Petugas...">
        <button id="btn-masuk-panitia" class="primary-btn" style="background:#0056b3;">MASUK</button>
    `;
    document.getElementById('btn-masuk-panitia').onclick = () => {
        if (document.getElementById('pass-panitia').value === "123") { 
            localStorage.setItem('isPanitia', 'true');
            showDashboardAdmin();
        } else { alert("Sandi Salah!"); }
    };
};

// --- 2. DASHBOARD DENGAN FITUR KUNCI ---
window.showDashboardAdmin = () => {
    const curHari = localStorage.getItem('activeHari') || "1";
    const curSesi = localStorage.getItem('activeSesi') || "SUBUH";
    const isLocked = localStorage.getItem('sessionLocked') === 'true';

    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <div style="text-align:center; margin-bottom:10px;">
            <h1 style="color:#0056b3; margin-bottom:5px;">PANITIA SCAN</h1>
            <div style="background:#eef2f7; padding:10px; border-radius:10px; margin-bottom:15px; border:1px solid #d1d9e6; position:relative;">
                <p style="margin:0 0 5px 0; font-size:11px; font-weight:bold; color:#555;">PENGATURAN SESI:</p>
                <div style="display:flex; gap:5px; align-items:center;">
                    <select id="set-hari" style="margin:0; flex:1;" ${isLocked ? 'disabled' : ''}>
                        ${[1,2,3,4,5,6].map(h => `<option value="${h}" ${curHari == h ? 'selected' : ''}>HARI ${h}</option>`).join('')}
                    </select>
                    <select id="set-sesi" style="margin:0; flex:1;" ${isLocked ? 'disabled' : ''}>
                        ${["SUBUH", "PAGI", "SIANG", "MALAM"].map(s => `<option value="${s}" ${curSesi == s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <button onclick="toggleLock()" style="background:none; border:none; font-size:20px; cursor:pointer;">${isLocked ? '🔒' : '🔓'}</button>
                </div>
            </div>
        </div>
        <button onclick="simpanSesiLaluScan()" class="scan-btn" style="height:100px; font-size:20px; background:#0056b3; margin-top:0;">📸 SCAN SEKARANG</button>
        <button onclick="showHalamanRekap()" class="primary-btn" style="background:#0056b3; margin-top:10px;">📊 REKAP KEHADIRAN</button>
        <button onclick="showHalamanBuatKartu()" class="primary-btn" style="background:#0056b3; margin-top:10px;">📇 BUAT KARTU BARCODE</button>
    `;
};

window.toggleLock = () => {
    const isLocked = localStorage.getItem('sessionLocked') === 'true';
    if (!isLocked) {
        localStorage.setItem('activeHari', document.getElementById('set-hari').value);
        localStorage.setItem('activeSesi', document.getElementById('set-sesi').value);
    }
    localStorage.setItem('sessionLocked', !isLocked);
    showDashboardAdmin();
};

window.simpanSesiLaluScan = () => {
    if (localStorage.getItem('sessionLocked') !== 'true') {
        localStorage.setItem('activeHari', document.getElementById('set-hari').value);
        localStorage.setItem('activeSesi', document.getElementById('set-sesi').value);
    }
    mulaiScanner();
};

// --- 3. SCANNER ---
window.mulaiScanner = () => {
    const scanSec = document.getElementById('scanner-section');
    scanSec.classList.remove('hidden');
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, async (txt) => {
        await window.stopScanner();
        prosesAbsensiOtomatis(txt); 
    }).catch(e => { alert("Kamera error!"); window.stopScanner(); });
};

window.stopScanner = async () => {
    const scanSec = document.getElementById('scanner-section');
    if (html5QrCode) { try { await html5QrCode.stop(); } catch (e) {} }
    scanSec.classList.add('hidden');
};

// --- 4. PROSES ABSENSI ---
window.prosesAbsensiOtomatis = async (isiBarcode) => {
    const h = localStorage.getItem('activeHari');
    const s = localStorage.getItem('activeSesi');
    try {
        const part = isiBarcode.split('|');
        if (part.length < 3) return alert("Barcode Tidak Valid!");
        const [level, desa, identitas] = part;
        const idDoc = `${isiBarcode.replace(/\|/g, '_')}_H${h}_${s}`; 
        const docRef = doc(db, "absensi_asrama", idDoc);
        
        await setDoc(docRef, {
            nama: identitas, 
            desa: desa,
            level: level,
            hari: h,
            sesi: s,
            waktu_absen: serverTimestamp()
        });
        tampilkanSukses(`${identitas} (${s})`);
    } catch (e) { alert("Error: " + e.message); }
};

function tampilkanSukses(identitas, desa) {
    // Hapus angka 1 atau 2 di akhir jika bukan kategori kelompok
    const namaBersih = identitas.replace(/\s\d+$/, ''); 
    const overlay = document.getElementById('success-overlay');
    
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div class="celebration-wrap">
            <div class="text-top">Alhamdulillah Jazaa Kumullahu Koiroo</div>
            <div class="text-main" style="font-size:2.2rem; line-height:1.2;">${namaBersih}</div>
            <div style="font-size:1.5rem; font-weight:bold; color:#FFD700; margin-top:5px; text-transform:uppercase;">${desa !== 'DAERAH' ? desa : ''}</div>
            <p style="font-size:18px; margin-top:15px; font-weight:bold;">ABSEN BERHASIL!</p>
            <audio id="success-sound" src="https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3" preload="auto"></audio>
        </div>
    `;
    const sound = document.getElementById('success-sound');
    if(sound) sound.play().catch(() => {});
    if (navigator.vibrate) navigator.vibrate(200);
    setTimeout(() => { overlay.style.display = 'none'; showDashboardAdmin(); }, 2500);
}

// --- 5. GENERATOR KARTU (2 KARTU) ---
window.showHalamanBuatKartu = () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <div class="card">
            <h3 style="color:#0056b3;">Generator Kartu</h3>
            <select id="select-kategori-kartu">
                <option value="">-- Pilih Kategori --</option>
                <option value="DAERAH">PENGURUS DAERAH</option>
                <option value="DESA">PENGURUS DESA</option>
                <option value="KELOMPOK">KELOMPOK</option>
            </select>
            <div id="sub-pilihan-container" style="margin-top:10px;"></div>
            <button id="btn-generate-act" class="primary-btn" style="background:#0056b3; display:none;">BUAT 2 KARTU SEKARANG</button>
            <button onclick="showDashboardAdmin()" class="primary-btn" style="background:#666;">KEMBALI</button>
        </div>
        <div id="container-kartu-hasil"></div>
    `;
    const katSel = document.getElementById('select-kategori-kartu');
    const subContainer = document.getElementById('sub-pilihan-container');
    const btnGen = document.getElementById('btn-generate-act');

    katSel.onchange = () => {
        subContainer.innerHTML = "";
        btnGen.style.display = "block";
        if (katSel.value === "DESA") {
            subContainer.innerHTML = `<select id="target-desa"><option value="">-- Pilih Desa --</option>${Object.keys(strukturOrganisasi.WILAYAH).map(d => `<option value="${d}">${d}</option>`).join('')}</select>`;
        } else if (katSel.value === "KELOMPOK") {
            subContainer.innerHTML = `
                <select id="target-desa-klp"><option value="">-- Pilih Desa --</option>${Object.keys(strukturOrganisasi.WILAYAH).map(d => `<option value="${d}">${d}</option>`).join('')}</select>
                <select id="target-klp" disabled><option value="">-- Pilih Kelompok --</option></select>`;
            const dS = document.getElementById('target-desa-klp');
            const kS = document.getElementById('target-klp');
            dS.onchange = () => {
                const kls = strukturOrganisasi.WILAYAH[dS.value] || [];
                kS.innerHTML = kls.map(k => `<option value="${k}">${k}</option>`).join('');
                kS.disabled = false;
            };
        }
    };

    btnGen.onclick = () => {
        const container = document.getElementById('container-kartu-hasil');
        container.innerHTML = "";
        const kategori = katSel.value;
        if (kategori === "DAERAH") {
            strukturOrganisasi.DAERAH.forEach(jab => render2Kartu(container, "DAERAH", "DAERAH", jab));
        } else if (kategori === "DESA") {
            const d = document.getElementById('target-desa').value;
            if(!d) return alert("Pilih Desa!");
            strukturOrganisasi.DESA_JABATAN.forEach(jab => render2Kartu(container, "DESA", d, jab));
        } else if (kategori === "KELOMPOK") {
            const d = document.getElementById('target-desa-klp').value;
            const k = document.getElementById('target-klp').value;
            if(!d || !k) return alert("Lengkapi pilihan!");
            render2Kartu(container, "KELOMPOK", d, k);
        }
    };
};
function render2Kartu(container, level, desa, identitas) {
    for (let i = 1; i <= 2; i++) {
        const labelPeserta = level === "KELOMPOK" ? "Peserta " : "";
        const namaUnik = `${identitas} ${labelPeserta}${i}`;
        const isiBarcode = `${level}|${desa}|${namaUnik}`;
        const cardId = `kartu-${Math.random().toString(36).substr(2, 9)}`;
        const div = document.createElement('div');
        div.style = "display:flex; flex-direction:column; align-items:center; margin-bottom:20px;";
        div.innerHTML = `
            <div id="${cardId}" class="qris-container">
                <div class="qris-header" style="background:#0056b3;"><h3>KARTU ASRAMA</h3></div>
                <div class="qris-event-name">
                    <b style="color:#0056b3;">${level}</b><br>
                    DESA : ${desa}<br>
                    <b>${namaUnik}</b>
                </div>
                <div id="qr-${cardId}" style="display:flex; justify-content:center; margin:15px 0;"></div>
                <div class="qris-footer" style="border-top: 5px solid #0056b3;"><p>ASRAMA KULON PROGO</p></div>
            </div>
            <button onclick="downloadKartu('${cardId}', '${namaUnik}')" class="primary-btn" style="width:200px; background:#0056b3;">⬇️ DOWNLOAD</button>
        `;
        container.appendChild(div);
        new QRCode(document.getElementById(`qr-${cardId}`), { text: isiBarcode, width: 150, height: 150 });
    }
}
window.downloadKartu = (elementId, fileName) => {
    const target = document.getElementById(elementId);
    html2canvas(target).then(canvas => {
        const link = document.createElement('a');
        link.download = `Kartu_${fileName}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

window.showHalamanRekap = async () => {
    const h = localStorage.getItem('activeHari') || "1";
    const s = localStorage.getItem('activeSesi') || "SUBUH";
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `<div style="text-align:center; padding:20px;"><h3>Memuat Data H${h} - ${s}...</h3></div>`;
    
    try {
        const q = query(collection(db, "absensi_asrama"), where("hari", "==", h), where("sesi", "==", s));
        const snap = await getDocs(q);
        let rekap = { DAERAH: [], DESA: [], KELOMPOK: { "WATES":[], "PENGASIH":[], "LENDAH":[], "TEMON":[], "SAMIGALUH":[] } };
        
        snap.forEach(doc => {
            const p = doc.data();
            if(p.level === "DAERAH") rekap.DAERAH.push(p);
            else if(p.level === "DESA") rekap.DESA.push(p);
            else { if(rekap.KELOMPOK[p.desa]) rekap.KELOMPOK[p.desa].push(p); }
        });

        let html = `
            <div id="print-rekap-area" style="background:white; padding:20px; width:1000px; font-family: sans-serif;">
                <h2 style="text-align:center; color:#0056b3; margin-bottom:20px; border-bottom:2px solid #0056b3; padding-bottom:10px;">LAPORAN KEHADIRAN ASRAMA (HARI ${h} - ${s})</h2>
                
                <div style="background:#0056b3; color:white; padding:8px; font-weight:bold; margin-bottom:10px;">PENGURUS DAERAH</div>
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
                    ${rekap.DAERAH.length > 0 ? rekap.DAERAH.map(p => renderBox(p, '32%')).join('') : '<p style="font-size:12px; color:#999; padding-left:10px;">Belum ada data</p>'}
                </div>

                <div style="background:#0056b3; color:white; padding:8px; font-weight:bold; margin-bottom:10px;">PENGURUS DESA</div>
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
                    ${rekap.DESA.length > 0 ? rekap.DESA.sort((a,b)=>a.desa.localeCompare(b.desa)).map(p => renderBox(p, '24%')).join('') : '<p style="font-size:12px; color:#999; padding-left:10px;">Belum ada data</p>'}
                </div>

                <div style="background:#0056b3; color:white; padding:8px; font-weight:bold; margin-bottom:10px; text-align:center;">REKAPITULASI KELOMPOK</div>
                <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; align-items: start;">
                    ${Object.keys(rekap.KELOMPOK).map(desa => `
                        <div style="border:1px solid #0056b3; border-radius:5px; overflow:hidden;">
                            <div style="background:#eef2f7; text-align:center; font-weight:bold; padding:5px; font-size:12px; border-bottom:1px solid #0056b3;">${desa}</div>
                            <div style="min-height:100px; padding:5px;">
                                ${rekap.KELOMPOK[desa].length > 0 
                                    ? rekap.KELOMPOK[desa].sort((a,b)=>a.nama.localeCompare(b.nama)).map(p => renderSmallBox(p)).join('') 
                                    : '<p style="font-size:9px; color:#ccc; text-align:center; margin-top:10px;">Kosong</p>'}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <button onclick="downloadLaporan()" class="primary-btn" style="background:#0056b3; margin-top:20px;">📥 DOWNLOAD LAPORAN (LANDSCAPE)</button>
            <button onclick="showDashboardAdmin()" class="primary-btn" style="background:#666; margin-top:10px;">KEMBALI</button>`;
        
        content.innerHTML = `<div style="overflow-x:auto; padding-bottom:20px;">${html}</div>`;
    } catch (e) { alert(e.message); showDashboardAdmin(); }
};

function renderBox(p, width) {
    const jam = p.waktu_absen ? p.waktu_absen.toDate().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}) : '--:--';
    return `<div style="width:${width}; background:#f9f9f9; border:1px solid #ddd; padding:8px; border-radius:5px; font-size:12px;">
                <div style="font-size:10px; color:#666;">${p.level === 'DESA' ? 'DESA ' + p.desa : 'DAERAH'}</div>
                <b>${p.nama.replace(/\s\d+$/, '')}</b><br>
                <span style="color:#0056b3; font-weight:bold; font-size:10px;">HADIR ${jam}</span>
            </div>`;
}

function renderSmallBox(p) {
    const jam = p.waktu_absen ? p.waktu_absen.toDate().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}) : '--:--';
    return `<div style="padding:5px; border-bottom:1px solid #eee; font-size:11px;">
                <b style="font-size:10px;">${p.nama}</b><br><span style="color:#0056b3; font-weight:bold; font-size:9px;">HADIR ${jam}</span>
            </div>`;
}

window.downloadLaporan = () => {
    const target = document.getElementById('print-rekap-area');
    html2canvas(target, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Laporan_H${localStorage.getItem('activeHari')}_${localStorage.getItem('activeSesi')}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

// Inisialisasi
if (localStorage.getItem('isPanitia')) showDashboardAdmin();
else showLoginPanitia();
