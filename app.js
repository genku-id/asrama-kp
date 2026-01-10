import { db } from './firebase-config.js';
import { 
    collection, getDoc, doc, setDoc, updateDoc, serverTimestamp, query, getDocs, where, orderBy, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const strukturOrganisasi = {
    "DAERAH": ["KEIMAMAN DAERAH", "WAKIL KEIMAMAN DAERAH", "MUBALLIGH DAERAH"],
    "DESA_JABATAN": ["KEIMAMAN DESA", "WAKIL KEIMAMAN DESA", "MUBALLIGH DESA"],
    "WILAYAH": {
        "WATES": ["KREMBANGAN", "BOJONG", "GIRIPENI 1", "GIRIPENI 2", "HARGOWILIS", "TRIHARJO"],
        "PENGASIH": ["MARGOSARI", "SENDANGSARI", "BANJARHARJO", "NANGGULAN", "GIRINYONO", "JATIMULYO", "SERUT"],
        "TEMON": ["TAWANGSARI", "HARGOREJO", "SIDATAN 1", "SIDATAN 2", "JOGOBOYO", "JOGORESAN"],
        "LENDAH": ["BONOSORO", "BUMIREJO", "CARIKAN", "NGENTAKREJO", "TUKSONO", "SRIKAYANGAN"],
        "SAMIGALUH": ["PENGOS", "SUREN", "KALIREJO", "PAGERHARJO", "SEPARANG", "KEBONHARJO"]
    }
};

let html5QrCode;
let sedangProses = false; 
let modeKameraSekarang = "user"; // Default kamera depan

// --- LOGIN ---
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

// --- DASHBOARD ---
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
        <button onclick="resetSemuaDataAbsensi()" class="primary-btn" style="background:#dc3545; margin-top:30px; font-size:12px;">⚠️ RESET SEMUA DATA (EVENT BARU)</button>
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

// --- SCANNER DENGAN FITUR GANTI KAMERA ---
window.mulaiScanner = () => {
    const scanSec = document.getElementById('scanner-section');
    scanSec.classList.remove('hidden');
    
    // Setup area tombol di dalam div reader
    const readerElem = document.getElementById('reader');
    readerElem.innerHTML = `
        <div style="position:absolute; top:15px; right:15px; z-index:999;">
            <button onclick="pindahKamera()" style="background:rgba(0,0,0,0.6); color:white; border:2px solid white; padding:10px; border-radius:50%; width:50px; height:50px; font-size:20px; cursor:pointer; display:flex; align-items:center; justify-content:center;">🔄</button>
        </div>
    `;

    html5QrCode = new Html5Qrcode("reader");
    jalankanKamera();
};

const jalankanKamera = () => {
    html5QrCode.start(
        { facingMode: modeKameraSekarang }, 
        { fps: 10, qrbox: 250 }, 
        async (txt) => {
            if (sedangProses) return; 
            sedangProses = true; 
            prosesAbsensiOtomatis(txt); 
        }
    ).catch(e => { 
        console.error("Kamera Error: ", e);
        alert("Gagal mengakses kamera.");
    });
};

window.pindahKamera = async () => {
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            modeKameraSekarang = (modeKameraSekarang === "user") ? "environment" : "user";
            jalankanKamera(); 
        } catch (e) {
            console.log("Error pindah kamera");
        }
    }
};

window.stopScanner = async () => {
    const scanSec = document.getElementById('scanner-section');
    if (html5QrCode) { 
        try { await html5QrCode.stop(); } catch (e) { } 
    }
    scanSec.classList.add('hidden');
    sedangProses = false;
};

// --- PROSES ABSENSI ---
window.prosesAbsensiOtomatis = async (isiBarcode) => {
    const h = localStorage.getItem('activeHari');
    const s = localStorage.getItem('activeSesi');
    try {
        const part = isiBarcode.split('|');
        if (part.length < 3) { sedangProses = false; return alert("Barcode Tidak Valid!"); }
        
        const idDoc = `${isiBarcode.replace(/\|/g, '_')}_H${h}_${s}`; 
        const docRef = doc(db, "absensi_asrama", idDoc);
        
        await setDoc(docRef, {
            id: idDoc, 
            nama: part[2], 
            desa: part[1],
            level: part[0],
            hari: h,
            sesi: s,
            waktu_absen: serverTimestamp()
        });
        tampilkanSukses(part[2], part[1], s);
    } catch (e) { alert("Error: " + e.message); sedangProses = false; }
};

// --- OVERLAY SUKSES ---
window.tampilkanSukses = (identitas, desa, sesi) => {
    const overlay = document.getElementById('success-overlay');
    const readerElem = document.getElementById('reader'); 
    const namaBersih = identitas.replace(/\s\d+$/, '');

    if (readerElem) readerElem.style.display = 'none';

    overlay.setAttribute('style', `
        display: flex !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background-color: #0056b3 !important;
        z-index: 999999 !important;
        flex-direction: column !important;
        justify-content: center !important;
        align-items: center !important;
        color: white !important;
        text-align: center !important;
        font-family: sans-serif !important;
    `);

    overlay.innerHTML = `
        <div style="padding: 20px;">
            <p style="font-size: 1.5rem; margin-bottom: 20px; color: #fff;">Alhamdulillah Jazaa Kumullahu Koiroo</p>
            <h1 style="font-size: 3.5rem; margin: 10px 0; text-transform: uppercase; color: #fff; line-height: 1.1;">${namaBersih}</h1>
            <h2 style="font-size: 2.2rem; color: #FFD700; text-transform: uppercase; margin-bottom: 30px;">${desa}</h2>
            <div style="font-size: 30px; font-weight: bold; border-top: 4px solid rgba(255,255,255,0.4); padding-top: 20px; color: #fff;">
                ABSEN ${sesi} BERHASIL!
            </div>
            <audio id="success-sound" src="https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3" preload="auto"></audio>
        </div>
    `;

    const sound = document.getElementById('success-sound');
    if(sound) sound.play().catch(() => {});
    if (navigator.vibrate) navigator.vibrate(200);

    setTimeout(() => { 
        overlay.style.display = 'none';
        if (readerElem) readerElem.style.display = 'block';
        sedangProses = false; 
    }, 3000);
}

// --- GENERATOR KARTU ---
window.showHalamanBuatKartu = () => {
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `
        <div class="card">
            <h3>Generator Kartu</h3>
            <select id="select-kategori-kartu">
                <option value="">-- Pilih Kategori --</option>
                <option value="DAERAH">PENGURUS DAERAH</option>
                <option value="DESA">PENGURUS DESA</option>
                <option value="KELOMPOK">KELOMPOK</option>
            </select>
            <div id="sub-pilihan-container" style="margin-top:10px;"></div>
            <button id="btn-generate-act" class="primary-btn" style="background:#0056b3; display:none;">GENERATE KARTU</button>
            <button onclick="showDashboardAdmin()" class="primary-btn" style="background:#666;">KEMBALI</button>
        </div>
        <div id="container-kartu-hasil" style="display:flex; flex-wrap:wrap; justify-content:center; gap:20px; margin-top:20px;"></div>
    `;
    const katSel = document.getElementById('select-kategori-kartu');
    const subContainer = document.getElementById('sub-pilihan-container');
    const btnGen = document.getElementById('btn-generate-act');

    katSel.onchange = () => {
        subContainer.innerHTML = "";
        btnGen.style.display = "block";
        if (katSel.value === "DESA") {
            subContainer.innerHTML = `<select id="target-desa">${Object.keys(strukturOrganisasi.WILAYAH).map(d => `<option value="${d}">${d}</option>`).join('')}</select>`;
        } else if (katSel.value === "KELOMPOK") {
            subContainer.innerHTML = `
                <select id="target-desa-klp">${Object.keys(strukturOrganisasi.WILAYAH).map(d => `<option value="${d}">${d}</option>`).join('')}</select>
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
            strukturOrganisasi.DESA_JABATAN.forEach(jab => render2Kartu(container, "DESA", d, jab));
        } else if (kategori === "KELOMPOK") {
            const d = document.getElementById('target-desa-klp').value;
            const k = document.getElementById('target-klp').value;
            render2Kartu(container, "KELOMPOK", d, k);
        }
    };
};

function render2Kartu(container, level, desa, identitas) {
    for (let i = 1; i <= 2; i++) {
        const labelUrutan = level === "KELOMPOK" ? `Peserta ${i}` : "";
        const namaUnik = `${identitas} ${labelUrutan}`.trim();
        const isiBarcode = `${level}|${desa}|${namaUnik}`;
        
        const cardId = `kartu-${Math.random().toString(36).substr(2, 9)}`;
        const div = document.createElement('div');
        div.style = "text-align:center; padding:15px; border:1px dashed #ccc; border-radius:10px; margin-bottom: 30px;";
        
        let infoTambahan = "";
        if (level === "DESA") {
            infoTambahan = `<div style="color:#000000; font-weight:bold; font-size:14px; margin-top:-5px; margin-bottom:10px; text-transform:uppercase;">DESA ${desa}</div>`;
        } else if (level === "KELOMPOK") {
            infoTambahan = `<div style="color:#000000; font-weight:bold; font-size:14px; margin-top:-5px; margin-bottom:10px; text-transform:uppercase;">PESERTA ${i}</div>`;
        } else {
            infoTambahan = `<div style="margin-bottom:15px;"></div>`;
        }

        div.innerHTML = `
            <div id="${cardId}" class="qris-container" style="background: transparent !important; width: 300px; margin: 0 auto;">
                <div class="card-content-overlay" style="text-align:center;">
                    <div class="label-peserta" style="background:#000000; color:#ffffff; padding:5px 15px; border-radius:4px; font-weight:bold; margin-bottom:8px; display:inline-block; font-size:13px; letter-spacing:1px;">PESERTA ASRAMA</div>
                    <div class="nama-jabatan" style="color:#000000; font-weight:900; font-size:22px; text-transform:uppercase; margin-bottom:5px; line-height:1.1; font-family:sans-serif;">${identitas}</div>
                    ${infoTambahan}
                    <div class="qr-zone" style="background: transparent !important; display: inline-block;">
                        <div id="qr-${cardId}"></div>
                    </div>
                </div>
            </div>
            <button onclick="downloadKartu('${cardId}', '${namaUnik}')" class="primary-btn" style="width:100%; max-width:250px; background:#004080; color:#ffffff; margin-top:15px; padding:12px; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:14px;">⬇️ DOWNLOAD PNG</button>
        `;
        container.appendChild(div);
        new QRCode(document.getElementById(`qr-${cardId}`), { 
            text: isiBarcode, 
            width: 160, 
            height: 160,
            colorDark : "#000000",
            colorLight : "rgba(255,255,255,0)",
            correctLevel : QRCode.CorrectLevel.H
        });
    }
}

window.downloadKartu = (elementId, fileName) => {
    const target = document.getElementById(elementId);
    setTimeout(() => {
        html2canvas(target, {
            scale: 4, 
            backgroundColor: null, 
            useCORS: true
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `Konten_${fileName}.png`;
            link.href = canvas.toDataURL("image/png", 1.0);
            link.click();
        });
    }, 1200); 
};

// --- REKAP & LAPORAN ---
window.showHalamanRekap = async () => {
    const viewHari = localStorage.getItem('viewHari') || localStorage.getItem('activeHari') || "1"; 
    const content = document.getElementById('pendaftar-section');
    content.innerHTML = `<div style="text-align:center; padding:20px;"><h3>Menyusun Laporan...</h3></div>`;
    
    try {
        let q = viewHari === "all" 
            ? query(collection(db, "absensi_asrama"), orderBy("waktu_absen", "asc"))
            : query(collection(db, "absensi_asrama"), where("hari", "==", viewHari.toString()));
        
        const snap = await getDocs(q);
        let matrix = {}; 
        let dataRekap = { DAERAH: [], PENGURUS_DESA: {}, KIRIMAN_KELOMPOK: {} };

        snap.forEach(docSnap => {
            const d = docSnap.data();
            const idPeserta = `${d.level}|${d.desa}|${d.nama}`;
            const sesiKey = `H${d.hari}_${d.sesi}`;
            const jam = d.waktu_absen ? d.waktu_absen.toDate().toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'}) : '✓';

            if (!matrix[idPeserta]) {
                matrix[idPeserta] = {};
                const info = { id: idPeserta, nama: d.nama, desa: d.desa, level: d.level }; 
                if (d.level === "DAERAH") dataRekap.DAERAH.push(info);
                else if (d.level === "DESA") {
                    if (!dataRekap.PENGURUS_DESA[d.desa]) dataRekap.PENGURUS_DESA[d.desa] = [];
                    dataRekap.PENGURUS_DESA[d.desa].push(info);
                } else {
                    if (!dataRekap.KIRIMAN_KELOMPOK[d.desa]) dataRekap.KIRIMAN_KELOMPOK[d.desa] = [];
                    dataRekap.KIRIMAN_KELOMPOK[d.desa].push(info);
                }
            }
            matrix[idPeserta][sesiKey] = jam;
        });

        const totalSesi = viewHari === 'all' ? 24 : 4;
        const biruPenyekat = "#0056b3";
        const minLebarTabel = viewHari === 'all' ? '2200px' : '650px';

        let html = `
            <div style="background:#f4f7f6; padding:10px; border-radius:10px; margin-bottom:15px; border:1px solid #ddd;">
                <p style="margin:0 0 8px 0; font-weight:bold; font-size:14px; color:#0056b3;">PILIH HARI:</p>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${[1,2,3,4,5,6].map(num => `<button onclick="setViewHari(${num})" style="flex:1; min-width:50px; padding:10px 0; border:none; border-radius:5px; font-size:13px; font-weight:bold; background:${viewHari == num ? '#0056b3' : '#ccc'}; color:white;">H${num}</button>`).join('')}
                    <button onclick="setViewHari('all')" style="flex:2; padding:10px 0; border:none; border-radius:5px; font-size:13px; font-weight:bold; background:${viewHari === 'all' ? '#28a745' : '#666'}; color:white;">SEMUA HARI</button>
                </div>
            </div>

            <div style="width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; border:1px solid #ddd; border-radius:8px;">
                <div id="print-rekap-area" style="background:white; padding:15px; width: max-content; min-width: 100%;">
                    <h2 style="text-align:center; color:#0056b3; margin-bottom:20px; border-bottom:3px solid #0056b3; padding-bottom:15px; text-transform:uppercase; font-size: 18px;">REKAP CHECKLIST ASRAMA</h2>
                    
                    <table style="min-width: ${minLebarTabel}; border-collapse: collapse; font-size:12px; border: 1px solid #ddd; table-layout: fixed;">
                        <thead>
                            <tr style="background:#0056b3; color:white;">
                                <th rowspan="2" style="padding:10px; border:1px solid #ddd; text-align:left; width:180px;">NAMA PESERTA / JABATAN</th>
                                ${(viewHari === 'all' ? [1,2,3,4,5,6] : [viewHari]).map(h => `<th colspan="4" style="border:1px solid #ddd; padding:8px; font-size:14px;">HARI ${h}</th>`).join('')}
                            </tr>
                            <tr style="background:#007bff; color:white;">
                                ${(viewHari === 'all' ? [1,2,3,4,5,6] : [viewHari]).map(h => `
                                    <th style="border:1px solid #ddd; padding:5px; font-size:10px; width:65px;">SUB</th>
                                    <th style="border:1px solid #ddd; padding:5px; font-size:10px; width:65px;">PAG</th>
                                    <th style="border:1px solid #ddd; padding:5px; font-size:10px; width:65px;">SIA</th>
                                    <th style="border:1px solid #ddd; padding:8px; font-size:10px; width:65px;">MAL</th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>`;

        html += renderPenyekatSticky("PENGURUS DAERAH", biruPenyekat, totalSesi, "white", "10px");
        dataRekap.DAERAH.sort((a,b) => a.nama.localeCompare(b.nama)).forEach(p => html += renderBarisMatriks(p, matrix, viewHari));

        html += renderPenyekatSticky("PENGURUS DESA", biruPenyekat, totalSesi, "white", "10px");
        Object.keys(dataRekap.PENGURUS_DESA).sort().forEach(desa => {
            html += renderPenyekatSticky(`DESA ${desa}`, "#f2f2f2", totalSesi, biruPenyekat, "15px");
            dataRekap.PENGURUS_DESA[desa].sort((a,b) => a.nama.localeCompare(b.nama)).forEach(p => html += renderBarisMatriks(p, matrix, viewHari));
        });

        html += renderPenyekatSticky("KIRIMAN KELOMPOK", biruPenyekat, totalSesi, "white", "10px");
        Object.keys(dataRekap.KIRIMAN_KELOMPOK).sort().forEach(desa => {
            html += renderPenyekatSticky(`KIRIMAN : ${desa}`, "#f2f2f2", totalSesi, biruPenyekat, "15px");
            dataRekap.KIRIMAN_KELOMPOK[desa].sort((a,b) => a.nama.localeCompare(b.nama)).forEach(p => html += renderBarisMatriks(p, matrix, viewHari, true));
        });

        html += `</tbody></table></div></div>
                 <div style="display:flex; flex-direction:column; gap:10px; margin-top:20px;">
                    <button onclick="downloadLaporan()" class="primary-btn" style="background:#0056b3; padding: 15px;">📥 DOWNLOAD GAMBAR LAPORAN</button>
                    <button onclick="showDashboardAdmin()" class="primary-btn" style="background:#666;">KEMBALI</button>
                 </div>`;
        content.innerHTML = html;
    } catch (e) { alert(e.message); showDashboardAdmin(); }
};

function renderPenyekatSticky(label, bgColor, totalCol, textColor, paddingLeft) {
    return `<tr>
        <td style="padding: 10px ${paddingLeft}; font-weight:bold; background:${bgColor}; color:${textColor}; border:1px solid #ddd; text-align:left; text-transform:uppercase; font-size:12px;">
            ${label}
        </td>
        <td colspan="${totalCol}" style="background:${bgColor}; border:1px solid #ddd;"></td>
    </tr>`;
}

function renderBarisMatriks(p, matrix, viewHari, isKelompok = false) {
    const hapusAngka = (str) => str.replace(/\s\d+$/, '');
    let namaTampil = isKelompok ? p.nama : hapusAngka(p.nama);
    let prefix = isKelompok ? "- " : "";
    let styleIndent = "padding-left:15px;";

    let rowHtml = `<tr>
        <td style="padding:10px; border:1px solid #ddd; background:#fff; font-weight:bold; text-transform:uppercase; text-align:left; ${styleIndent} overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${prefix}${namaTampil}
        </td>`;

    const hariLoop = viewHari === 'all' ? [1,2,3,4,5,6] : [viewHari];
    hariLoop.forEach(h => {
        ["SUBUH", "PAGI", "SIANG", "MALAM"].forEach(s => {
            const jam = matrix[p.id] ? matrix[p.id][`H${h}_${s}`] : null;
            rowHtml += `<td style="padding:8px; border:1px solid #ddd; text-align:center; background:${jam ? '#eef9f1' : 'transparent'}; font-size:12px;">
                ${jam ? `<span style="color:#28a745; font-weight:bold;">${jam}</span>` : '-'}
            </td>`;
        });
    });
    rowHtml += `</tr>`;
    return rowHtml;
}

window.setViewHari = (num) => { localStorage.setItem('viewHari', num); showHalamanRekap(); };
window.downloadLaporan = () => {
    const target = document.getElementById('print-rekap-area');
    html2canvas(target, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Laporan_Asrama.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

if (localStorage.getItem('isPanitia')) showDashboardAdmin();
else showLoginPanitia();

// --- FUNGSI RESET TOTAL ---
window.resetSemuaDataAbsensi = async () => {
    const pass = prompt("Masukkan Sandi Konfirmasi untuk RESET TOTAL:");
    if (pass === "123") { 
        if (confirm("PERINGATAN! Semua data kehadiran akan DIHAPUS PERMANEN. Lanjutkan?")) {
            try {
                const q = query(collection(db, "absensi_asrama"));
                const snap = await getDocs(q);
                const promises = snap.docs.map(d => deleteDoc(d.ref));
                await Promise.all(promises);
                alert("Database Berhasil Dibersihkan!");
                location.reload(); 
            } catch (e) {
                alert("Gagal reset: " + e.message);
            }
        }
    } else {
        alert("Sandi Salah. Reset dibatalkan.");
    }
};
