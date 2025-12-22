// lib/firebase.js
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDQ_2mbGvvf_n1xCJQ43bfVIrPZTDrJplc",
  authDomain: "ataayatoko.firebaseapp.com",
  projectId: "ataayatoko",
  storageBucket: "ataayatoko.firebasestorage.app",
  messagingSenderId: "510779810640",
  appId: "1:510779810640:web:2658d0e6673f19379a0255",
  measurementId: "G-2RSPX9JDGW"
};

// Inisialisasi Firebase App (aman di server & client)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 🔑 Inisialisasi Auth HANYA di browser
const auth = typeof window !== 'undefined' ? getAuth(app) : null;

// Inisialisasi Firestore (aman di server & client)
const db = getFirestore(app);

export { auth, db };