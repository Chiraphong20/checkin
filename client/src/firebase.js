
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// 🔧 ใส่ config ของคุณจาก Firebase Console ตรงนี้
const firebaseConfig = {
  apiKey: "AIzaSyCdFTEgmZqcY5LwCVLJkUa51fqJa7JwETg",
  authDomain: "checkin-16f25.firebaseapp.com",
  projectId: "checkin-16f25",
  storageBucket: "checkin-16f25.firebasestorage.app",
  messagingSenderId: "763468433243",
  appId: "1:763468433243:web:6c9621b7937d334489bc7e",
  measurementId: "G-996KVTYR9P"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ สร้าง instance ของ Firestore และ Auth
const db = getFirestore(app);
const auth = getAuth(app);

// ✅ export ตัวแปรออกไปให้ไฟล์อื่นใช้
export { db, auth,app };
// ✅ export ทั้ง app และ db

