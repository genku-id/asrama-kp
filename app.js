import { db } from './firebase-config.js';
import { 
    collection, getDoc, doc, setDoc, updateDoc, serverTimestamp, query, orderBy, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DATA STRUKTUR (Hierarki Baru)
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

// --- 1. TAMPILAN AWAL (LOGIN PANITIA) ---
window.showLoginPanitia = () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <h2 style="margin-top:0; color:#0056b3;">Login Panitia Asrama</h2>
        <input type="password" id="pass-panitia" placeholder="Masukkan Sandi Petugas...">
        <button id="btn-masuk-panitia" class="primary-btn" style="background:#0056b3;">MASUK</button>
    `;

    document.getElementById('btn-masuk-panitia').onclick = () => {
        const pass = document.getElementById('pass-panitia').value;
        if (pass === "123") { 
            localStorage.setItem('isPanitia', 'true');
            showDashboardAdmin();
        } else {
            alert("Sandi Salah!");
        }
    };
};

// --- 2. DASHBOARD SCANNING ---
window.showDashboardAdmin = () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <h1 style="color:#0056b3; margin-bottom:5px;">MODE SCANNER</h1>
            <p style="font-size:14px; color:#666;">Scan kartu untuk absen otomatis</p>
        </div>
        <button onclick="showHalamanBuatKartu()" class="primary-btn" style="background:#0056b3; margin-top:10px;">📇 BUAT KARTU BARCODE</button>
        <button onclick="showHalamanRekap()" class="primary-btn" style="background:#0056b3; margin-top:10px;">📊 REKAP KEHADIRAN</button>
        <button onclick='mulaiScanner()' class="scan-btn" style="height:120px; font-size:22px; background:#0056b3;">📸 SCAN SEKARANG</button>
    `;
};

// --- 3. LOGIKA SCANNER ---
window.mulaiScanner = () => {
    const scanSec = document.getElementById('scanner-section');
    scanSec.classList.remove('hidden');
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, async (txt) => {
        await window.stopScanner();
        prosesAbsensiOtomatis(txt); 
    }).catch(e => {
        alert("Kamera error!");
        window.stopScanner();
    });
};

window.stopScanner = async () => {
    const scanSec = document.getElementById('scanner-section');
    if (html5QrCode) { try { await html5QrCode.stop(); } catch (e) {} }
    scanSec.classList.add('hidden');
};

// --- 4. PROSES ABSENSI OTOMATIS (LANGSUNG HADIR) ---
window.prosesAbsensiOtomatis = async (isiBarcode) => {
    try {
        const part = isiBarcode.split('|');
        if (part.length < 3) return alert("Barcode Tidak Valid!");

        const level = part[0];
        const desa = part[1];
        const identitas = part[2];
        const idDoc = isiBarcode.replace(/\|/g, '_'); 

        const docRef = doc(db, "peserta_asrama", idDoc);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            await updateDoc(docRef, { status_hadir: true, waktu_absen: serverTimestamp() });
        } else {
            await setDoc(docRef, {
                nama: identitas, 
                desa: desa,
                level: level,
                status_hadir: true,
                waktu_absen: serverTimestamp()
            });
        }
        tampilkanSukses(identitas);
    } catch (e) { alert("Error: " + e.message); }
};

// --- 5. OVERLAY SUKSES ---
function tampilkanSukses(identitas) {
    const overlay = document.getElementById('success-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div class="celebration-wrap">
            <div class="text-top">ALHAMDULILLAH</div>
            <div class="text-main">${identitas}</div>
            <p style="font-size:24px; font-weight:bold;">BERHASIL ABSEN!</p>
            <audio id="success-sound" src="https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3" preload="auto"></audio>
        </div>
    `;
    const sound = document.getElementById('success-sound');
    if(sound) sound.play().catch(e => console.log("Audio blocked"));
    if (navigator.vibrate) navigator.vibrate(200);
    setTimeout(() => {
        overlay.style.display = 'none';
        showDashboardAdmin();
    }, 2500);
}

// --- 6. GENERATOR KARTU (2 BARCODE PER PILIHAN) ---
window.showHalamanBuatKartu = () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <div class="card">
            <h3 style="color:#0056b3;">Generator Kartu Asrama</h3>
            <select id="select-kategori-kartu">
                <option value="">-- Pilih Kategori --</option>
                <option value="DAERAH">PENGURUS DAERAH</option>
                <option value="DESA">PENGURUS DESA</option>
                <option value="KELOMPOK">KELOMPOK (31 KLP)</option>
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

// --- 7. HALAMAN REKAP KEHADIRAN (BERDASARKAN KATEGORI) ---
window.showHalamanRekap = async () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `<div style="text-align:center; padding:20px;"><h3>Memuat Data...</h3></div>`;
    try {
        const q = query(collection(db, "peserta_asrama"), orderBy("waktu_absen", "desc"));
        const snap = await getDocs(q);
        let hadir = { DAERAH: [], DESA: [], KELOMPOK: [] };
        snap.forEach(doc => {
            const d = doc.data();
            if(hadir[d.level]) hadir[d.level].push(d);
        });

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0; color:#0056b3;">Laporan Kehadiran</h3>
                <button onclick="showDashboardAdmin()" style="background:#666; color:white; border:none; padding:5px 12px; border-radius:8px;">X</button>
            </div>`;

        ["DAERAH", "DESA", "KELOMPOK"].forEach(lvl => {
            html += `<div style="background:#0056b3; color:white; padding:8px 15px; font-weight:bold; margin-top:15px; border-radius:5px;">${lvl}</div>`;
            if(hadir[lvl].length === 0) html += `<p style="font-size:12px; color:#999; padding:10px;">Belum ada data.</p>`;
            hadir[lvl].forEach(p => {
                const jam = p.waktu_absen ? p.waktu_absen.toDate().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}) : '-';
                html += `
                    <div style="background:white; border-bottom:1px solid #eee; padding:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div><div style="font-weight:bold;">${p.nama}</div><div style="font-size:11px; color:#666;">${p.desa}</div></div>
                        <div style="color:#0056b3; font-weight:bold;">${jam}</div>
                    </div>`;
            });
        });

        html += `<button onclick="showDashboardAdmin()" class="primary-btn" style="background:#666; margin-top:20px;">KEMBALI</button>`;
        content.innerHTML = html;
    } catch (e) { alert(e.message); showDashboardAdmin(); }
};

// Inisialisasi
if (localStorage.getItem('isPanitia')) showDashboardAdmin();
else showLoginPanitia();
