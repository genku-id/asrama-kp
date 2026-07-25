import { db } from './firebase-config.js';
import { 
    collection, getDoc, doc, setDoc, serverTimestamp, query, getDocs, where, orderBy, deleteDoc, onSnapshot
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
let cameraList = [];
let currentCameraIndex = 0;
let isKameraAktif = false;

// === REAL-TIME SETTINGS LISTENER ===
onSnapshot(doc(db, "settings", "appSettings"), (docSnap) => {
    if (docSnap.exists() && window.alpineApp) {
        const data = docSnap.data();
        if(window.alpineApp.activeSesi !== data.activeSesi) window.alpineApp.activeSesi = data.activeSesi || 'Sesi 1';
        if(window.alpineApp.sessionLocked !== data.sessionLocked) window.alpineApp.sessionLocked = data.sessionLocked || false;
    }
});

window.updateSesiKeDatabase = async (sesi) => {
    try { await setDoc(doc(db, "settings", "appSettings"), { activeSesi: sesi }, { merge: true }); }
    catch (e) { console.error("Update Sesi Error:", e); }
};

window.updateLockKeDatabase = async (isLocked) => {
    try { await setDoc(doc(db, "settings", "appSettings"), { sessionLocked: isLocked }, { merge: true }); }
    catch (e) { console.error("Update Lock Error:", e); }
};

// === SCANNER LOGIC ===
window.jalankanScannerApp = async () => {
    const scanSec = document.getElementById('scanner-section');
    scanSec.classList.remove('hidden');
    scanSec.classList.add('flex');
    
    document.getElementById('scanner-status').innerText = "Mencari Kamera...";

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }

    // Ambil daftar semua kamera fisik di HP
    try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
            cameraList = devices;
            // Coba cari kamera belakang (main camera) secara default. Biasanya ada kata "back" atau "0".
            // Kita set index 0 dulu, jika ultra wide, user bisa klik pindah kamera.
            let backCamIndex = devices.findIndex(c => c.label.toLowerCase().includes('back') && !c.label.toLowerCase().includes('ultra'));
            if(backCamIndex === -1) backCamIndex = devices.findIndex(c => c.label.toLowerCase().includes('back'));
            
            if (backCamIndex !== -1) currentCameraIndex = backCamIndex;
            else currentCameraIndex = 0;
        }
    } catch (err) {
        console.warn("Gagal mendapatkan daftar kamera spesifik, menggunakan mode default.", err);
    }

    // Tombol Pindah Kamera (Ganti fungsi untuk me-looping semua kamera)
    const btnPindah = document.getElementById('btn-pindah-kamera');
    btnPindah.onclick = async (e) => {
        e.preventDefault();
        if(cameraList.length <= 1) return; // Jika cuma 1 kamera, tidak usah ganti

        document.getElementById('scanner-status').innerText = "Menukar Kamera...";
        if (html5QrCode && isKameraAktif) {
            try {
                await html5QrCode.stop();
                isKameraAktif = false;
                currentCameraIndex = (currentCameraIndex + 1) % cameraList.length;
                startKamera();
            } catch (err) {
                console.error("Gagal menukar kamera:", err);
            }
        }
    };

    startKamera();
};

const startKamera = () => {
    let cameraConfig = { facingMode: "environment" }; // Fallback
    if (cameraList && cameraList.length > 0) {
        cameraConfig = { deviceId: { exact: cameraList[currentCameraIndex].id } };
    }

    html5QrCode.start(
        cameraConfig, 
        { 
            fps: 10, 
            qrbox: function(viewfinderWidth, viewfinderHeight) {
                let minEdgePercentage = 0.65; // 65% of the screen width/height
                let minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
                let qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
                return {
                    width: qrboxSize,
                    height: qrboxSize
                };
            }
        }, 
        async (decodedText) => {
            if (sedangProses) return; 
            sedangProses = true; 
            if (html5QrCode) html5QrCode.pause(); // Jeda kamera supaya layar ijo (sukses scan) terlihat

            // Beri waktu 2 detik sebelum memproses dan memunculkan overlay
            setTimeout(async () => {
                await prosesAbsensiOtomatis(decodedText); 
            }, 2000);
        }
    ).then(() => {
        isKameraAktif = true;
        let camName = cameraList.length > 0 ? cameraList[currentCameraIndex].label : "Kamera Aktif";
        if(camName.length > 20) camName = camName.substring(0, 17) + '...'; // Potong nama agar tidak terlalu panjang
        document.getElementById('scanner-status').innerText = camName;
    }).catch(err => { 
        alert("Kamera Error / Izin Ditolak.");
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
    const s = window.alpineApp ? window.alpineApp.activeSesi : 'Sesi 1';
    
    if (window.alpineApp) {
        window.alpineApp.activeSesi = s;
    }
    
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

    clearTimeout(window.successTimeout);
    window.successTimeout = setTimeout(() => { 
        window.tutupSukses();
    }, 3000);
};

window.tutupSukses = () => {
    const overlay = document.getElementById('success-overlay');
    const readerElem = document.getElementById('reader');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    if (readerElem) readerElem.style.display = 'flex';
    sedangProses = false; 
    if (html5QrCode) html5QrCode.resume();
    clearTimeout(window.successTimeout);
};

// === REKAP LOGIC ===
window.fetchRekapData = async () => {
    try {
        // Buat kerangka matriks 62 kelompok
        const matrix = [];
        for (const daerah in WILAYAH) {
            const kelompoks = WILAYAH[daerah];
            for (const kel of kelompoks) {
                matrix.push({ daerah: daerah, nama: `${kel} A`, sesi1: '-', sesi2: '-', sesi3: '-', sesi4: '-', sesi5: '-', sesi6: '-' });
                matrix.push({ daerah: daerah, nama: `${kel} B`, sesi1: '-', sesi2: '-', sesi3: '-', sesi4: '-', sesi5: '-', sesi6: '-' });
            }
        }

        // Ambil semua data absensi
        const q = query(collection(db, "absensi_asrama"));
        const snap = await getDocs(q);
        
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const time = d.waktu_absen ? d.waktu_absen.toDate().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}) : 'V';
            
            const row = matrix.find(r => r.nama === d.nama);
            if (row) {
                if (d.sesi === "Sesi 1") row.sesi1 = time;
                else if (d.sesi === "Sesi 2") row.sesi2 = time;
                else if (d.sesi === "Sesi 3") row.sesi3 = time;
                else if (d.sesi === "Sesi 4") row.sesi4 = time;
                else if (d.sesi === "Sesi 5") row.sesi5 = time;
                else if (d.sesi === "Sesi 6") row.sesi6 = time;
            }
        });
        
        return matrix;
    } catch (e) {
        console.error("Gagal mengambil rekap:", e);
        return [];
    }
};

window.shareLaporanWA = async (data) => {
    if (!data || data.length === 0) return alert("Belum ada data.");
    
    const btn = document.getElementById('btn-share');
    const oldText = btn.innerHTML;
    btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> MEMPROSES GAMBAR...`;
    
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.position = 'fixed';
    hiddenContainer.style.top = '-9999px';
    hiddenContainer.style.left = '-9999px';
    hiddenContainer.style.width = '1123px';
    hiddenContainer.style.zIndex = '-9999';
    

    
    const renderTable = (rows, title) => {
        let rowsHtml = '';
        rows.forEach((r, i) => {
            const bg = i % 2 === 0 ? 'background-color: white;' : 'background-color: #f8fafc;';
            const s1 = r.sesi1 !== '-' ? 'color: #16a34a;' : 'color: #cbd5e1;';
            const s2 = r.sesi2 !== '-' ? 'color: #16a34a;' : 'color: #cbd5e1;';
            const s3 = r.sesi3 !== '-' ? 'color: #16a34a;' : 'color: #cbd5e1;';
            const s4 = r.sesi4 !== '-' ? 'color: #16a34a;' : 'color: #cbd5e1;';
            const s5 = r.sesi5 !== '-' ? 'color: #16a34a;' : 'color: #cbd5e1;';
            const s6 = r.sesi6 !== '-' ? 'color: #16a34a;' : 'color: #cbd5e1;';
            
            rowsHtml += `
            <tr style="${bg} border-bottom: 1px solid #e2e8f0; font-size: 13px;">
                <td style="padding: 5px 12px; border-right: 1px solid #e2e8f0;">${r.daerah}</td>
                <td style="padding: 5px 12px; border-right: 1px solid #e2e8f0; font-weight: bold;">${r.nama}</td>
                <td style="padding: 5px 12px; border-right: 1px solid #e2e8f0; text-align: center; font-weight: bold; ${s1}">${r.sesi1}</td>
                <td style="padding: 5px 12px; border-right: 1px solid #e2e8f0; text-align: center; font-weight: bold; ${s2}">${r.sesi2}</td>
                <td style="padding: 5px 12px; border-right: 1px solid #e2e8f0; text-align: center; font-weight: bold; ${s3}">${r.sesi3}</td>
                <td style="padding: 5px 12px; border-right: 1px solid #e2e8f0; text-align: center; font-weight: bold; ${s4}">${r.sesi4}</td>
                <td style="padding: 5px 12px; border-right: 1px solid #e2e8f0; text-align: center; font-weight: bold; ${s5}">${r.sesi5}</td>
                <td style="padding: 5px 12px; text-align: center; font-weight: bold; ${s6}">${r.sesi6}</td>
            </tr>`;
        });
        
        return `
        <div style="width: 1123px; min-height: 794px; height: auto; background: white; padding: 30px 40px; box-sizing: border-box; font-family: 'Inter', sans-serif;">
            <h2 style="text-align: center; margin-top: 0; margin-bottom: 15px; font-size: 20px; color: #1e293b; text-transform: uppercase; font-weight: 800;">Rekapitulasi Kehadiran Asrama Kulon Progo - ${title}</h2>
            <table style="width: 100%; border-collapse: collapse; text-align: left; border: 1px solid #cbd5e1;">
                <thead style="background-color: #eef2ff; color: #3730a3; font-size: 14px;">
                    <tr>
                        <th style="padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">Desa / Wilayah</th>
                        <th style="padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">Nama Kelompok</th>
                        <th style="padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; text-align: center;">Sesi 1</th>
                        <th style="padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; text-align: center;">Sesi 2</th>
                        <th style="padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; text-align: center;">Sesi 3</th>
                        <th style="padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; text-align: center;">Sesi 4</th>
                        <th style="padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; text-align: center;">Sesi 5</th>
                        <th style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; text-align: center;">Sesi 6</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
        `;
    };
    
    const daerahKeys = ["WATES", "PENGASIH", "TEMON", "LENDAH", "SAMIGALUH"];
    let containerHtml = "";
    
    daerahKeys.forEach((daerah, idx) => {
        const rowsForDaerah = data.filter(r => r.daerah === daerah);
        containerHtml += `<div id="hal-${idx + 1}">${renderTable(rowsForDaerah, `PC ${daerah}`)}</div>`;
    });
    
    hiddenContainer.innerHTML = containerHtml;
    document.body.appendChild(hiddenContainer);
    
    try {
        const filesToShare = [];
        const blobsToDownload = [];
        
        for (let i = 0; i < daerahKeys.length; i++) {
            const canvas = await html2canvas(document.getElementById(`hal-${i + 1}`), { scale: 2, useCORS: true });
            const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
            blobsToDownload.push({ blob: blob, name: `Laporan_Asrama_${daerahKeys[i]}.jpg` });
            filesToShare.push(new File([blob], `Laporan_Asrama_${daerahKeys[i]}.jpg`, { type: 'image/jpeg' }));
        }
        
        if (navigator.canShare && navigator.canShare({ files: filesToShare })) {
            await navigator.share({
                title: 'Laporan Rekap Asrama',
                text: 'Berikut adalah laporan kehadiran per desa/kecamatan.',
                files: filesToShare
            });
        } else {
            blobsToDownload.forEach((item, index) => {
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(item.blob);
                    link.download = item.name;
                    link.click();
                }, index * 500); // Jeda setengah detik tiap download agar tidak diblokir browser
            });
            
            alert("Perangkat Anda tidak mendukung fitur Share langsung. Ke-5 gambar laporan telah otomatis diunduh ke galeri/HP Anda.");
        }
    } catch (e) {
        console.error(e);
        alert("Gagal memproses gambar. Pastikan memori cukup.");
    } finally {
        document.body.removeChild(hiddenContainer);
        btn.innerHTML = oldText;
    }
};

// === GENERATOR KARTU LOGIC ===
window.generateKartuSemuaKelompok = async () => {
    const container = document.getElementById('tempat-kartu');
    container.innerHTML = `
        <div class="w-full flex justify-between items-center mb-4 bg-gray-50 p-4 rounded-xl border print-hide">
            <span class="font-bold text-gray-700" id="status-generator">Memproses Kartu (0/62)...</span>
            <button id="btn-share-kartu" onclick="window.shareSemuaKartu()" class="px-4 py-2 bg-green-600 hover:bg-green-700 transition-colors text-white rounded-lg font-bold text-sm shadow hidden flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                SHARE
            </button>
        </div>
        <p class="text-xs text-gray-500 mb-4 print-hide">Tip: Kartu di bawah ini berupa GAMBAR transparan. Anda bisa tap+tahan / klik-kanan untuk <b>Copy Image</b> atau klik Share untuk membagikan semuanya.</p>
        <div id="grid-kartu" class="grid grid-cols-2 gap-4 w-full"></div>
    `;
    
    const grid = document.getElementById('grid-kartu');
    const statusText = document.getElementById('status-generator');
    
    window.generatedKartuFiles = [];
    
    let count = 0;
    // Looping 31 Kelompok
    for (const daerah in WILAYAH) {
        const kelompoks = WILAYAH[daerah];
        for (const kel of kelompoks) {
            // Tiap kelompok dibuat 2 (A dan B)
            await renderKartuSingle(grid, daerah, kel, "A");
            count++;
            statusText.innerText = `Memproses Kartu (${count}/62)...`;
            
            await renderKartuSingle(grid, daerah, kel, "B");
            count++;
            statusText.innerText = `Memproses Kartu (${count}/62)...`;
        }
    }
    statusText.innerText = "62 QR Code Siap Dibagikan!";
    document.getElementById('btn-share-kartu').classList.remove('hidden');
};

window.shareSemuaKartu = async () => {
    try {
        if (!window.generatedKartuFiles || window.generatedKartuFiles.length === 0) {
            alert("Kartu belum selesai diproses.");
            return;
        }
        
        if (navigator.canShare && navigator.canShare({ files: window.generatedKartuFiles })) {
            await navigator.share({
                title: 'Kartu QR Asrama',
                text: 'Berikut adalah 62 Kartu QR tanpa background.',
                files: window.generatedKartuFiles
            });
        } else {
            alert("Perangkat Anda mungkin tidak mendukung Share multi-file (62 gambar sekaligus). Silakan simpan manual gambar-gambar di bawah.");
        }
    } catch (e) {
        console.error(e);
        alert("Gagal membagikan kartu. Error: " + e.message);
    }
};

function renderKartuSingle(container, daerah, kel, suffix) {
    return new Promise((resolve) => {
        const namaPeserta = `${kel} ${suffix}`;
        const isiBarcode = `KELOMPOK|${daerah}|${namaPeserta}`;
        const cardId = `qr-${Math.random().toString(36).substr(2, 9)}`;
        
        // Container sementara untuk di render menjadi canvas
        const tempWrapper = document.createElement('div');
        tempWrapper.className = "p-2 flex flex-col items-center justify-center text-center";
        tempWrapper.style.position = "fixed";
        tempWrapper.style.top = "-9999px"; 
        tempWrapper.style.width = "200px";
        
        tempWrapper.innerHTML = `
            <div class="font-bold text-[12px] text-gray-700 mb-1 uppercase tracking-widest">${daerah}</div>
            <div id="${cardId}" class="mb-1 bg-white p-1 rounded-lg"></div>
            <div class="font-bold text-[13px] text-gray-800 uppercase tracking-widest leading-tight" style="word-wrap: break-word;">
                ${namaPeserta}
            </div>
        `;
        
        document.body.appendChild(tempWrapper);
        
        new QRCode(document.getElementById(cardId), { 
            text: isiBarcode, 
            width: 140, 
            height: 140,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        
        // Convert to Image
        setTimeout(() => {
            html2canvas(tempWrapper, { scale: 3, backgroundColor: null, logging: false }).then(canvas => {
                const finalImg = document.createElement('img');
                finalImg.src = canvas.toDataURL("image/png");
                finalImg.className = "w-full rounded-xl shadow-[0_0_10px_rgba(0,0,0,0.05)] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjUiIGhlaWdodD0iNSIgZmlsbD0iI2YwZjBmMCIvPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSI1IiBoZWlnaHQ9IjUiIGZpbGw9IiNmMGYwZjAiLz48L3N2Zz4=')] hover:shadow-md cursor-pointer transition-shadow";
                finalImg.title = "Tap tahan / Klik Kanan untuk Salin Gambar";
                
                container.appendChild(finalImg);
                tempWrapper.remove();
                
                canvas.toBlob(blob => {
                    if (window.generatedKartuFiles) {
                        window.generatedKartuFiles.push(new File([blob], `Kartu_${daerah}_${kel}_${suffix}.png`, { type: 'image/png' }));
                    }
                    resolve();
                }, 'image/png');
            }).catch(e => {
                console.error("html2canvas error:", e);
                tempWrapper.remove();
                resolve(); // resolve anyway so loop continues
            });
        }, 100);
    });
}

// === RESET DATABASE LOGIC ===
window.resetSemuaDataAbsensi = async () => {
    const pass = prompt("Masukkan Sandi Konfirmasi (123) untuk RESET TOTAL:");
    if (pass === "123") { 
        if (confirm("PERINGATAN! Semua data kehadiran akan DIHAPUS PERMANEN. Lanjutkan?")) {
            try {
                const q = query(collection(db, "absensi_asrama"));
                const snap = await getDocs(q);
                
                const promises = snap.docs.map(d => deleteDoc(d.ref));
                await Promise.all(promises);
                
                alert("Database Berhasil Dibersihkan! Siap untuk event berikutnya.");
                if(window.alpineApp) window.alpineApp.fetchRekap();
            } catch (e) {
                alert("Gagal reset: " + e.message);
            }
        }
    } else {
        alert("Sandi Salah. Reset dibatalkan.");
    }
};
