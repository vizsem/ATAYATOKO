// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDQ_2mbGvvf_n1xCJQ43bfVIrPZTDrJplc",
  authDomain: "ataayatoko.firebaseapp.com",
  projectId: "ataayatoko",
  storageBucket: "ataayatoko.firebasestorage.app",
  messagingSenderId: "510779810640",
  appId: "1:510779810640:web:2658d0e6673f19379a0255",
  measurementId: "G-2RSPX9JDGW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);