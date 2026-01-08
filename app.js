import { db } from './firebase-config.js';
import { 
    collection, getDoc, doc, setDoc, updateDoc, serverTimestamp, query, orderBy, getDocs, where 
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

// --- 2. DASHBOARD (DENGAN PILIHAN SESI) ---
window.showDashboardAdmin = () => {
    // Ambil sesi terakhir yang dipilih dari memori HP agar tidak pilih ulang terus
    const curHari = localStorage.getItem('activeHari') || "1";
    const curSesi = localStorage.getItem('activeSesi') || "SUBUH";

    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <div style="text-align:center; margin-bottom:10px;">
            <h1 style="color:#0056b3; margin-bottom:5px;">PANITIA SCAN</h1>
            <div style="background:#eef2f7; padding:10px; border-radius:10px; margin-bottom:15px; border:1px solid #d1d9e6;">
                <p style="margin:0 0 5px 0; font-size:12px; font-weight:bold; color:#555;">SETTING SESI AKTIF:</p>
                <div style="display:flex; gap:5px;">
                    <select id="set-hari" style="margin:0; flex:1;">
                        ${[1,2,3,4,5,6].map(h => `<option value="${h}" ${curHari == h ? 'selected' : ''}>HARI ${h}</option>`).join('')}
                    </select>
                    <select id="set-sesi" style="margin:0; flex:1;">
                        ${["SUBUH", "PAGI", "SIANG", "MALAM"].map(s => `<option value="${s}" ${curSesi == s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>
        <button onclick="simpanSesiLaluScan()" class="scan-btn" style="height:100px; font-size:20px; background:#0056b3; margin-top:0;">📸 SCAN SEKARANG</button>
        <button onclick="showHalamanRekap()" class="primary-btn" style="background:#0056b3; margin-top:10px;">📊 REKAP KEHADIRAN</button>
        <button onclick="showHalamanBuatKartu()" class="primary-btn" style="background:#0056b3; margin-top:10px;">📇 BUAT KARTU BARCODE</button>
    `;
};

window.simpanSesiLaluScan = () => {
    const h = document.getElementById('set-hari').value;
    const s = document.getElementById('set-sesi').value;
    localStorage.setItem('activeHari', h);
    localStorage.setItem('activeSesi', s);
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

// --- 4. PROSES ABSENSI (MULTI-SESI) ---
window.prosesAbsensiOtomatis = async (isiBarcode) => {
    const h = localStorage.getItem('activeHari');
    const s = localStorage.getItem('activeSesi');

    try {
        const part = isiBarcode.split('|');
        if (part.length < 3) return alert("Barcode Tidak Valid!");

        const [level, desa, identitas] = part;
        // ID Unik per orang per sesi: BOJONG_1_H1_SUBUH
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

// --- 5. OVERLAY SUKSES ---
function tampilkanSukses(identitas) {
    const overlay = document.getElementById('success-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div class="celebration-wrap">
            <div class="text-top">ALHAMDULILLAH</div>
            <div class="text-main" style="font-size:2rem;">${identitas}</div>
            <p style="font-size:18px; font-weight:bold;">ABSEN BERHASIL!</p>
        </div>
    `;
    if (navigator.vibrate) navigator.vibrate(200);
    setTimeout(() => { overlay.style.display = 'none'; showDashboardAdmin(); }, 2000);
}

// --- 6. GENERATOR KARTU (TETAP SAMA) ---
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
        <div id="container-kartu-hasil" style="margin-top:20px; display:flex; flex-direction:column; align-items:center; gap:20px;"></div>
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
        const namaUnik = `${identitas} ${i}`;
        const isiBarcode = `${level}|${desa}|${namaUnik}`;
        const cardId = `kartu-${Math.random().toString(36).substr(2, 9)}`;
        const div = document.createElement('div');
        div.innerHTML = `
            <div id="${cardId}" class="qris-container" style="margin-bottom:10px;">
                <div class="qris-header" style="background:#0056b3;"><h3>KARTU ASRAMA</h3></div>
                <div class="qris-event-name" style="font-size:14px; margin-top:10px;">
                    <b style="color:#0056b3;">${level}</b><br>
                    DESA : ${desa}<br>
                    <b>${namaUnik}</b>
                </div>
                <div id="qr-${cardId}" style="display:flex; justify-content:center; margin:15px 0;"></div>
                <div class="qris-footer" style="border-top: 5px solid #0056b3;"><p>ASRAMA KULON PROGO</p></div>
            </div>
            <button onclick="downloadKartu('${cardId}', '${namaUnik}')" class="primary-btn" style="width:200px; margin-bottom:30px; background:#0056b3;">⬇️ DOWNLOAD</button>
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

// --- 7. REKAP (FILTER PER SESI) ---
window.showHalamanRekap = async () => {
    const curHari = localStorage.getItem('activeHari') || "1";
    const curSesi = localStorage.getItem('activeSesi') || "SUBUH";

    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `<div style="text-align:center; padding:20px;"><h3>Memuat Data H${curHari} - ${curSesi}...</h3></div>`;
    
    try {
        // KODE DIPERBARUI: Mengambil data absensi_asrama tanpa filter berlebih dulu
        const q = query(collection(db, "absensi_asrama"), 
                  where("hari", "==", curHari), 
                  where("sesi", "==", curSesi));
        
        const snap = await getDocs(q);
        
        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0; color:#0056b3;">Laporan H${curHari} - ${curSesi}</h3>
                <button onclick="showDashboardAdmin()" style="background:#666; color:white; border:none; padding:5px 12px; border-radius:8px;">X</button>
            </div>`;

        if(snap.empty) {
            html += `<p style="text-align:center; color:#999; padding:20px;">Belum ada yang absen di sesi ini.</p>`;
        } else {
            // Urutkan manual di sini agar tidak butuh Index Descending yang rumit
            const dataSorted = snap.docs.map(doc => doc.data()).sort((a, b) => {
                return (b.waktu_absen?.toMillis() || 0) - (a.waktu_absen?.toMillis() || 0);
            });

            dataSorted.forEach(p => {
                const jam = p.waktu_absen ? p.waktu_absen.toDate().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}) : '-';
                html += `
                    <div style="background:white; border-bottom:1px solid #eee; padding:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div><div style="font-weight:bold;">${p.nama}</div><div style="font-size:11px; color:#666;">${p.desa}</div></div>
                        <div style="color:#0056b3; font-weight:bold;">${jam}</div>
                    </div>`;
            });
        }

        html += `<button onclick="showDashboardAdmin()" class="primary-btn" style="background:#666; margin-top:20px;">KEMBALI</button>`;
        content.innerHTML = html;
    } catch (e) { 
        console.error(e);
        alert("Gagal memuat rekap. Pastikan Index sudah aktif di Console."); 
        showDashboardAdmin(); 
    }
};

// Inisialisasi
if (localStorage.getItem('isPanitia')) showDashboardAdmin();
else showLoginPanitia();
