// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBGJnXbpdw5A3X6iN96k_paWE5HpuyhwwU",
  authDomain: "asrama-kp.firebaseapp.com",
  projectId: "asrama-kp",
  storageBucket: "asrama-kp.firebasestorage.app",
  messagingSenderId: "778422084284",
  appId: "1:778422084284:web:ff7f01efc7b9065a8c66b9",
  measurementId: "G-ZD7SSE00T7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export db agar bisa dipakai di app.js
export const db = getFirestore(app);
