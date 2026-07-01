
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// 🔧 ใส่ config ของคุณจาก Firebase Console ตรงนี้
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ สร้าง instance ของ Firestore และ Auth
const db = getFirestore(app);
const auth = getAuth(app);

// ✅ export ตัวแปรออกไปให้ไฟล์อื่นใช้
export { db, auth,app };
// ✅ export ทั้ง app และ db

