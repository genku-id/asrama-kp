import { db } from './firebase-config.js';
import { 
    collection, getDoc, doc, setDoc, serverTimestamp, query, getDocs, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const WILAYAH = {
    "WATES": ["KREMBANGAN", "BOJONG", "GIRIPENI 1", "GIRIPENI 2", "HARGOWILIS", "TRIHARJO"],
    "PENGASIH": ["MARGOSARI", "SENDANGSARI", "BANJARHARJO", "NANGGULAN", "GIRINYONO", "JATIMULYO", "SERUT"],
    "TEMON": ["TAWANGSARI", "HARGOREJO", "SIDATAN 1", "SIDATAN 2", "JOGOBOYO", "JOGORESAN"],
    "LENDAH": ["BONOSORO", "BUMIREJO", "CARIKAN", "NGENTAKREJO", "TUKSONO", "SRIKAYANGAN"],
    "SAMIGALUH": ["PENGOS", "SUREN", "KALIREJO", "PAGERHARJO", "SEPARANG", "KEBONHARJO"]
};

let html5QrCode = null;
let sedangProses = false;
let modeKameraSekarang = "environment"; // Default to back camera for easier scanning

// === SCANNER LOGIC ===
window.jalankanScannerApp = () => {
    const scanSec = document.getElementById('scanner-section');
    scanSec.classList.remove('hidden');
    scanSec.classList.add('flex');
    
    document.getElementById('scanner-status').innerText = "Memulai Kamera...";

    // Tombol Pindah Kamera
    const btnPindah = document.getElementById('btn-pindah-kamera');
    btnPindah.onclick = async (e) => {
        e.preventDefault();
        document.getElementById('scanner-status').innerText = "Menukar Kamera...";
        if (html5QrCode) {
            try {
                await html5QrCode.stop();
                modeKameraSekarang = (modeKameraSekarang === "environment") ? "user" : "environment";
                startKamera();
            } catch (err) {
                console.error("Gagal menukar kamera:", err);
            }
        }
    };

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }
    startKamera();
};

const startKamera = () => {
    html5QrCode.start(
        { facingMode: modeKameraSekarang }, 
        { fps: 10, qrbox: { width: 250, height: 250 } }, 
        async (decodedText) => {
            if (sedangProses) return; 
            sedangProses = true; 
            if (html5QrCode) html5QrCode.pause();
            await prosesAbsensiOtomatis(decodedText); 
        }
    ).then(() => {
        document.getElementById('scanner-status').innerText = "Kamera Aktif";
    }).catch(err => { 
        alert("Kamera Error: Pastikan izin kamera diizinkan di browser.");
        window.stopScanner();
    });
};

window.stopScanner = async () => {
    const scanSec = document.getElementById('scanner-section');
    if (html5QrCode) { 
        try { await html5QrCode.stop(); } catch (e) { console.error(e); } 
    }
    scanSec.classList.add('hidden');
    scanSec.classList.remove('flex');
    sedangProses = false;
};

const prosesAbsensiOtomatis = async (isiBarcode) => {
    const s = localStorage.getItem('activeSesi') || 'Sesi 1';
    try {
        // Expected format: KELOMPOK|DAERAH|NAMA (e.g. KELOMPOK|WATES|GIRIPENI 1 A)
        const part = isiBarcode.split('|');
        if (part.length < 3) { 
            sedangProses = false; 
            if (html5QrCode) html5QrCode.resume();
            alert("Barcode Tidak Valid!"); 
            return;
        }
        
        const type = part[0];
        const daerah = part[1];
        const nama = part[2];

        // Format ID Document: NAMA_SESI (e.g. GIRIPENI_1_A_Sesi_1)
        const idDoc = `${nama.replace(/\s+/g, '_')}_${s.replace(/\s+/g, '_')}`; 
        const docRef = doc(db, "absensi_asrama", idDoc);
        
        await setDoc(docRef, {
            id: idDoc, 
            nama: nama, 
            daerah: daerah,
            type: type,
            sesi: s,
            waktu_absen: serverTimestamp()
        });
        
        tampilkanSukses(nama, daerah, s);
    } catch (e) { 
        alert("Gagal Absen: " + e.message); 
        sedangProses = false; 
        if (html5QrCode) html5QrCode.resume();
    }
};

const tampilkanSukses = (nama, kelompok, sesi) => {
    const overlay = document.getElementById('success-overlay');
    const readerElem = document.getElementById('reader'); 
    
    if (readerElem) readerElem.style.display = 'none';

    document.getElementById('sukses-nama').innerText = nama;
    document.getElementById('sukses-kelompok').innerText = kelompok;
    document.getElementById('sukses-sesi').innerText = `ABSEN ${sesi}`;

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    const sound = document.getElementById('success-sound');
    if(sound) sound.play().catch(() => {});
    if (navigator.vibrate) navigator.vibrate(200);

    setTimeout(() => { 
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        if (readerElem) readerElem.style.display = 'flex';
        sedangProses = false; 
        if (html5QrCode) html5QrCode.resume();
    }, 3000);
};

// === REKAP LOGIC ===
window.fetchRekapData = async (filterSesi) => {
    try {
        let q;
        if (filterSesi) {
            q = query(collection(db, "absensi_asrama"), where("sesi", "==", filterSesi), orderBy("waktu_absen", "desc"));
        } else {
            q = query(collection(db, "absensi_asrama"), orderBy("waktu_absen", "desc"));
        }
        
        const snap = await getDocs(q);
        const data = [];
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const time = d.waktu_absen ? d.waktu_absen.toDate().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}) : '-';
            data.push({
                id: d.id,
                nama: d.nama,
                sesi: d.sesi,
                waktu: time
            });
        });
        return data;
    } catch (e) {
        console.error("Gagal mengambil rekap:", e);
        return [];
    }
};

// === GENERATOR KARTU LOGIC ===
window.generateKartuSemuaKelompok = () => {
    const container = document.getElementById('tempat-kartu');
    container.innerHTML = `
        <div class="w-full flex justify-between items-center mb-4 bg-gray-50 p-4 rounded-xl border">
            <span class="font-bold text-gray-700">62 QR Code Siap Cetak</span>
            <button onclick="window.print()" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm shadow">PRINT HALAMAN INI</button>
        </div>
        <div id="grid-kartu" class="grid grid-cols-2 gap-4 w-full"></div>
    `;
    
    const grid = document.getElementById('grid-kartu');
    
    // Looping 31 Kelompok
    for (const daerah in WILAYAH) {
        const kelompoks = WILAYAH[daerah];
        kelompoks.forEach(kel => {
            // Tiap kelompok dibuat 2 (A dan B)
            renderKartuSingle(grid, daerah, kel, "A");
            renderKartuSingle(grid, daerah, kel, "B");
        });
    }
};

function renderKartuSingle(container, daerah, kel, suffix) {
    const namaPeserta = `${kel} ${suffix}`;
    const isiBarcode = `KELOMPOK|${daerah}|${namaPeserta}`;
    const cardId = `qr-${Math.random().toString(36).substr(2, 9)}`;
    
    const wrapper = document.createElement('div');
    wrapper.className = "bg-white border-2 border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center print:border-black print:break-inside-avoid";
    
    wrapper.innerHTML = `
        <div class="font-bold text-[10px] text-gray-500 mb-1 uppercase tracking-wider">${daerah}</div>
        <div id="${cardId}" class="mb-3"></div>
        <div class="bg-blue-600 print:bg-black text-white w-full py-1.5 rounded font-black text-sm uppercase tracking-wide truncate px-2" title="${namaPeserta}">
            ${namaPeserta}
        </div>
    `;
    
    container.appendChild(wrapper);
    
    new QRCode(document.getElementById(cardId), { 
        text: isiBarcode, 
        width: 120, 
        height: 120,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}
