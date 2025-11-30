# ระบบเช็คอินพนักงาน (Employee Check-in System)

ระบบเช็คอินพนักงานผ่าน LINE LIFF App พร้อมการสแกน QR Code และการจัดการข้อมูลพนักงาน

## 🚀 Features

- ✅ เช็คอินผ่าน LINE LIFF App
- 📱 สแกน QR Code เพื่อเช็คอิน
- 📍 ตรวจสอบตำแหน่ง GPS
- 📊 รายงานการเช็คอิน
- 👥 จัดการข้อมูลพนักงาน
- 🏢 จัดการสาขา
- 📈 รายงานเงินเดือน
- 🎯 ระบบคำนวณค่าปรับ (สาย, หยุด)

## 🛠️ Tech Stack

### Frontend
- React + Vite
- Ant Design
- LINE LIFF SDK
- HTML5 QR Code Scanner
- Firebase Firestore

### Backend
- Node.js
- Express
- Firebase Admin SDK

## 📁 Project Structure

```
Check_inPJ/
├── client/          # Frontend React App
├── server/          # Backend Node.js Server
└── README.md
```

## 🔧 Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Firebase project
- LINE Developers account

### Setup

1. Clone the repository
```bash
git clone https://github.com/Chiraphong20/checkin.git
cd checkin
```

2. Install dependencies

**Frontend:**
```bash
cd client
npm install
```

**Backend:**
```bash
cd server
npm install
```

3. Configure Firebase
   - Create a Firebase project
   - Add Firebase configuration to `client/src/firebase.js`
   - Add service account key to `server/serviceAccountKey.json` (⚠️ Do not commit this file!)

4. Configure LINE LIFF
   - Create a LINE LIFF App in LINE Developers Console
   - Update LIFF ID in `client/src/pages/EmployeeCheckIn.jsx`

## 🚀 Running the Application

### Frontend
```bash
cd client
npm run dev
```

### Backend
```bash
cd server
npm start
```

## 📝 Environment Variables

Create `.env` files for environment variables (not included in repository):

**client/.env:**
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
```

## 🔒 Security

⚠️ **Important:** Never commit the following files:
- `serviceAccountKey.json`
- `.env` files
- Any files containing API keys or secrets

These files are already included in `.gitignore`.

## 📄 License

This project is private and proprietary.

## 👥 Authors

- Chiraphong20

## 📞 Contact

For issues and questions, please open an issue on GitHub.







