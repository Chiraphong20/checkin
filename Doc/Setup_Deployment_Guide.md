# คู่มือการติดตั้งและ Deploy (Setup & Deployment Guide)

คำแนะนำเบื้องต้นสำหรับการติดตั้งและรันระบบ Employee Check-in 

---

## 1. การติดตั้งในเครื่อง Local (สำหรับนักพัฒนา)

### 1.1 โคลนโปรเจกต์และติดตั้งแต่ Library
```bash
# Frontend
cd client
npm install

# Backend
cd ../server
npm install
```

### 1.2 ตั้งค่า Environment Variables (`.env`)
ในฝั่ง Backend ให้สร้างไฟล์ `.env` :

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASS=1234
DB_NAME=check_in_db

JWT_SECRET=your_super_secret_key
```

สำหรับฝั่ง Frontend (ถ้ามี) ให้ระบุ URL ของ Backend `.env`
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 1.3 สตาร์ทเซิร์ฟเวอร์
- ฝั่ง Backend `node index.js` หรือ `npm run dev`
- ฝั่ง Frontend `npm run dev` (พอร์ตที่รันปกติคือ 5173 หากใช้ Vite)

---

## 2. คำแนะนำการนำขึ้น Production (Deployment)

1. **Frontend**: แนะนำให้ไป Publish ผ่านการรัน `npm run build` และอาจฝากไฟล์ Build ไว้ที่ Host อย่าง Vercel, Netlify หรือ Nginx ของหน่วยงาน
2. **Backend**: ฝาก Server ไว้กับ Heroku, Render.com, หรือ VPS/EC2 ของหน่วยงาน 
3. **Database**: ตั้งค่า Cloud MySQL เช่น RDS ของ AWS หรือสร้างฐานข้อมูลที่แผงควบคุมของ Hosting

> [!NOTE]
> *เพื่อความปลอดภัย* ไม่ควรนำโค้ด `.env` ใส่รวมไปกับ Git Public ให้ตั้งค่า Variables ผ่านระบบหลังบ้านของ Host ที่เอาขึ้นไปวางแทน
