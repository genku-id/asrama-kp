import { db } from './firebase-config.js';
import { 
    collection, getDoc, doc, setDoc, updateDoc, serverTimestamp, query, orderBy, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DATA WILAYAH (Wajib ada agar Generator Kartu Berjalan)
const dataWilayah = {
    "WATES": ["KREMBANGAN", "BOJONG", "GIRIPENI 1", "GIRIPENI 2", "HARGOWILIS", "TRIHARJO"],
    "PENGASIH": ["MARGOSARI", "SENDANGSARI", "BANJARHARJO", "NANGGULAN", "GIRINYONO", "JATIMULYO", "SERUT"],
    "TEMON": ["TAWANGSARI", "HARGOREJO", "SIDATAN 1", "SIDATAN 2", "JOGOBOYO", "JOGORESAN"],
    "LENDAH": ["BONOSORO", "BUMIREJO", "CARIKAN", "NGENTAKREJO", "TUKSONO", "SRIKAYANGAN"],
    "SAMIGALUH": ["PENGOS", "SUREN", "KALIREJO", "PAGERHARJO", "SEPARANG", "KEBONHARJO"]
};

let html5QrCode;

// --- 1. TAMPILAN AWAL (LOGIN PANITIA) ---
window.showLoginPanitia = () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <h2 style="margin-top:0; color:#0056b3;">Login Panitia Asrama</h2>
        <input type="password" id="pass-panitia" placeholder="Masukkan Sandi Petugas...">
        <button id="btn-masuk-panitia" class="primary-btn">MASUK</button>
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
        <button onclick="showHalamanRekap()" class="primary-btn" style="background:#ffc107; color:black; margin-top:10px;">📊 REKAP KEHADIRAN</button>
        <button onclick='mulaiScanner()' class="scan-btn" style="height:120px; font-size:22px;">📸 SCAN SEKARANG</button>
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

        const desa = part[0];
        const kelompok = part[1];
        const nomor = part[2];
        const idDoc = isiBarcode.replace(/\|/g, '_'); 

        const docRef = doc(db, "peserta_asrama", idDoc);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            await updateDoc(docRef, {
                status_hadir: true,
                waktu_absen: serverTimestamp()
            });
        } else {
            await setDoc(docRef, {
                nama: `${kelompok} ${nomor}`, 
                desa: desa,
                kelompok: kelompok,
                status_hadir: true,
                waktu_absen: serverTimestamp()
            });
        }
        tampilkanSukses(`${kelompok} ${nomor}`);
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

// --- 6. GENERATOR KARTU (MENANAM DATA KE QR) ---
window.showHalamanBuatKartu = () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <div class="card">
            <h3 style="color:#0056b3;">Generator Kartu Asrama</h3>
            <select id="select-desa-kartu">
                <option value="">-- Pilih Desa --</option>
                ${Object.keys(dataWilayah).map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
            <select id="select-klp-kartu" disabled>
                <option value="">-- Pilih Kelompok --</option>
            </select>
            <button id="btn-generate-5" class="primary-btn" style="background:#28a745;">BUAT 5 KARTU SEKARANG</button>
            <button onclick="showDashboardAdmin()" class="primary-btn" style="background:#666;">KEMBALI</button>
        </div>
        <div id="container-kartu-hasil" style="margin-top:20px; display:flex; flex-direction:column; align-items:center; gap:20px;"></div>
    `;

    const dSel = document.getElementById('select-desa-kartu');
    const kSel = document.getElementById('select-klp-kartu');

    dSel.onchange = () => {
        const kls = dataWilayah[dSel.value] || [];
        kSel.innerHTML = '<option value="">Pilih Kelompok</option>' + kls.map(k => `<option value="${k}">${k}</option>`).join('');
        kSel.disabled = false;
    };

    document.getElementById('btn-generate-5').onclick = () => {
        if(!dSel.value || !kSel.value) return alert("Pilih Desa & Kelompok!");
        render5Kartu(dSel.value, kSel.value);
    };
};

window.render5Kartu = (desa, kelompok) => {
    const container = document.getElementById('container-kartu-hasil');
    container.innerHTML = ""; 

    for (let i = 1; i <= 5; i++) {
        const isiBarcode = `${desa}|${kelompok}|${i}`;
        const cardId = `kartu-wrap-${i}`;
        
        const cardHtml = `
            <div id="${cardId}" class="qris-container" style="margin-bottom:10px;">
                <div class="qris-header"><h3>KARTU ASRAMA</h3></div>
                <div class="qris-event-name" style="font-size:14px; margin-top:10px;">
                    DESA : ${desa}<br>
                    KELOMPOK : ${kelompok}
                </div>
                <div id="qr-area-${i}" style="display:flex; justify-content:center; margin:15px 0;"></div>
                <div style="font-size:10px; color:#999; margin-bottom:10px;">NO PESERTA: ${i}</div>
                <div class="qris-footer"><p>ASRAMA KULON PROGO</p></div>
            </div>
            <button onclick="downloadKartu('${cardId}', '${kelompok}_${i}')" class="primary-btn" style="width:200px; margin-bottom:30px; background:#0056b3;">⬇️ DOWNLOAD GAMBAR</button>
        `;
        
        const div = document.createElement('div');
        div.innerHTML = cardHtml;
        container.appendChild(div);

        new QRCode(document.getElementById(`qr-area-${i}`), {
            text: isiBarcode, 
            width: 150,
            height: 150
        });
    }
};

window.downloadKartu = (elementId, fileName) => {
    const target = document.getElementById(elementId);
    html2canvas(target).then(canvas => {
        const link = document.createElement('a');
        link.download = `Kartu_${fileName}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

// --- 7. HALAMAN REKAP KEHADIRAN ---
window.showHalamanRekap = async () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `<div style="text-align:center; padding:20px;"><h3>Memuat Data Rekap...</h3></div>`;

    try {
        const q = query(collection(db, "peserta_asrama"), orderBy("waktu_absen", "desc"));
        const querySnapshot = await getDocs(q);
        
        let htmlRekap = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0; color:#0056b3;">Rekap Kehadiran</h3>
                <button onclick="showDashboardAdmin()" style="background:#666; color:white; border:none; padding:5px 12px; border-radius:8px; cursor:pointer;">X</button>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse: collapse; font-size:12px; background:white;">
                    <thead>
                        <tr style="background:#0056b3; color:white;">
                            <th style="padding:10px; border:1px solid #ddd;">IDENTITAS</th>
                            <th style="padding:10px; border:1px solid #ddd;">DESA</th>
                            <th style="padding:10px; border:1px solid #ddd;">JAM</th>
                        </tr>
                    </thead>
                    <tbody>`;

        if (querySnapshot.empty) {
            htmlRekap += `<tr><td colspan="3" style="text-align:center; padding:20px;">Belum ada data absen.</td></tr>`;
        } else {
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const waktu = data.waktu_absen ? data.waktu_absen.toDate().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}) : '-';
                htmlRekap += `
                    <tr>
                        <td style="padding:10px; border:1px solid #ddd;"><b>${data.nama}</b></td>
                        <td style="padding:10px; border:1px solid #ddd;">${data.desa}</td>
                        <td style="padding:10px; border:1px solid #ddd; text-align:center;">${waktu}</td>
                    </tr>`;
            });
        }

        htmlRekap += `</tbody></table></div>
                      <button onclick="showDashboardAdmin()" class="primary-btn" style="background:#666; margin-top:20px;">KEMBALI</button>`;
        
        content.innerHTML = htmlRekap;
    } catch (e) {
        alert("Gagal memuat rekap: " + e.message);
        showDashboardAdmin();
    }
};

// Inisialisasi
if (localStorage.getItem('isPanitia')) showDashboardAdmin();
else showLoginPanitia();
