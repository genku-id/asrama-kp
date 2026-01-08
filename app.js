import { db } from './firebase-config.js';
import { 
    collection, getDoc, doc, setDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
        if (pass === "123") { // Silakan ganti sandi ini
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
            <p style="font-size:14px; color:#666;">Silahkan scan kartu peserta</p>
        </div>
        
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
        prosesAbsensiAsrama(txt);
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

// --- 4. PROSES ABSENSI OTOMATIS ---
window.prosesAbsensiAsrama = async (idKartu) => {
    try {
        const docRef = doc(db, "peserta_asrama", idKartu);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // JIKA TERDAFTAR: Langsung absen
            const data = docSnap.data();
            await updateDoc(docRef, {
                status_hadir: true,
                waktu_absen: serverTimestamp()
            });
            tampilkanSukses(data.nama);
        } else {
            // JIKA BELUM: Form Daftar
            tampilkanFormRegistrasi(idKartu);
        }
    } catch (e) { alert("Error: " + e.message); }
};

// --- 5. REGISTRASI PESERTA BARU ---
window.tampilkanFormRegistrasi = (idKartu) => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <div class="card">
            <h3>Daftarkan Bapak Baru</h3>
            <p>ID Kartu: <b>${idKartu}</b></p>
            <input type="text" id="reg-nama-bapak" placeholder="Nama Lengkap...">
            <select id="reg-desa-bapak">
                <option value="">-- Pilih Desa --</option>
                <option value="DESA 1">DESA 1</option>
                <option value="DESA 2">DESA 2</option>
                <option value="DESA 3">DESA 3</option>
                <option value="DESA 4">DESA 4</option>
                <option value="DESA 5">DESA 5</option>
            </select>
            <input type="text" id="reg-kelompok-bapak" placeholder="Kelompok (Cth: KLP 01)">
            <button onclick="simpanBapakBaru('${idKartu}')" class="primary-btn">SIMPAN & ABSEN</button>
            <button onclick="showDashboardAdmin()" style="background:#666;" class="primary-btn">BATAL</button>
        </div>
    `;
};

window.simpanBapakBaru = async (idKartu) => {
    const nama = document.getElementById('reg-nama-bapak').value.toUpperCase();
    const desa = document.getElementById('reg-desa-bapak').value;
    const kelompok = document.getElementById('reg-kelompok-bapak').value.toUpperCase();

    if(!nama || !desa || !kelompok) return alert("Data harus lengkap!");

    await setDoc(doc(db, "peserta_asrama", idKartu), {
        nama, desa, kelompok, status_hadir: true, waktu_absen: serverTimestamp()
    });
    tampilkanSukses(nama);
};

// --- 6. OVERLAY SUKSES (TETAP PAKAI GAYA LAMAMU) ---
function tampilkanSukses(nama) {
    const overlay = document.getElementById('success-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div class="celebration-wrap">
            <div class="text-top">ALHAMDULILLAH</div>
            <div class="text-main">${nama}</div>
            <p style="font-size:24px; font-weight:bold;">BERHASIL ABSEN!</p>
            <audio id="success-sound" src="https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3" preload="auto"></audio>
        </div>
    `;
    
    const sound = document.getElementById('success-sound');
    if(sound) sound.play().catch(e => console.log("Audio blocked"));
    if (navigator.vibrate) navigator.vibrate(200); // HP Bergetar
    
    setTimeout(() => {
        overlay.style.display = 'none';
        showDashboardAdmin();
    }, 2500); // Durasi overlay dipercepat biar bisa scan bapak selanjutnya
}

// Inisialisasi
if (localStorage.getItem('isPanitia')) showDashboardAdmin();
else showLoginPanitia();
