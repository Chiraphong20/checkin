# การกำหนดสภาพแวดล้อมการพัฒนาระบบ (Development Environment)

เอกสารนี้แสดงรายละเอียดไลบรารีและเครื่องมือที่ใช้พัฒนาระบบ

---

## 1. ซอฟต์แวร์สำหรับการพัฒนา (Dev Prerequisites)

| ซอฟต์แวร์ | เวอร์ชันแนะนำ | วัตถุประสงค์ |
| :--- | :---: | :--- |
| **Node.js** | 20.x ขี้นไป | รัน Frontend/Backend |
| **npm** | มากับ Node | จัดการ Dependencies |
| **MySQL Server** | 8.x | จัดการฐานข้อมูล (Local Dev) |

---

## 2. สภาพแวดล้อมฝั่ง Frontend (Client)

ใช้สถาปัตยกรรม SPA (Single Page Application)

| Library | เทคโนโลยี/บทบาท |
| :--- | :--- |
| **React** | 18.x ขึ้นไป (UI Framework) |
| **Vite** | Build Tool / Dev Server ความเร็วสูง |
| **TailwindCSS** | ตกแต่งหน้าตาแบบ Utility First |
| **React Router** | จัดการการเปลี่ยนหน้า (Routing) |
| **Axios** | เรียก API ส่งไปยัง Backend |

---

## 3. สภาพแวดล้อมฝั่ง Backend (Server)

| Library | เทคโนโลยี/บทบาท |
| :--- | :--- |
| **Express.js** | REST API Framework บน Node.js |
| **mysql2 / Sequelize** | จัดการเชื่อมต่อและ Query ข้อมูล |
| **bcryptjs** | เข้ารหัสพาสเวิร์ด |
| **jsonwebtoken (JWT)** | สร้าง Token ยืนยันสิทธิ์ |
| **cors / dotenv** | ตั้งค่าเข้าให้ดึงข้อมูลข้ามพอร์ตและตั้ง Env |

---

## 4. โครงสร้างโฟลเดอร์สำหรับนักพัฒนา

```
Check_inPJ/
├── client/          (React Frontend)
│   ├── src/
│   │   ├── components/  (ส่วนย่อยของ UI)
│   │   ├── pages/       (หน้าเว็บ เช่น EmployeeCheckIn, AdminDashboard)
│   │   └── utils/       (ตัวช่วยต่างๆ เช่น ฟังก์ชันแปลงเวลา)
├── server/          (Node Express Backend)
│   ├── controllers/ (ตรรกะควบคุม API)
│   ├── routes/      (Endpoint)
│   └── models/      (โครงสร้าง DB)
└── Doc/             (เอกสารนี้)
```
