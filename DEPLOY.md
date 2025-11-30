# 📋 คู่มือการ Deploy โปรเจกต์ขึ้น GitHub

## ⚠️ สิ่งสำคัญก่อน Deploy

1. **ตรวจสอบไฟล์ที่ sensitive:**
   - ✅ `serviceAccountKey.json` ถูก ignore แล้ว (ใน .gitignore)
   - ✅ `.env` files ถูก ignore แล้ว
   - ✅ `node_modules/` ถูก ignore แล้ว

2. **ตรวจสอบว่าไฟล์สำคัญถูก commit:**
   - ✅ `.gitignore`
   - ✅ `README.md`
   - ✅ Source code files

## 🚀 ขั้นตอนการ Deploy

### วิธีที่ 1: ใช้ PowerShell Script (แนะนำ)

1. เปิด PowerShell ในโฟลเดอร์โปรเจกต์
2. รันคำสั่ง:
```powershell
.\deploy.ps1
```

### วิธีที่ 2: ใช้ Git Commands เอง

1. **เปิด Terminal/PowerShell ในโฟลเดอร์โปรเจกต์**

2. **Initialize Git Repository (ถ้ายังไม่มี):**
```bash
git init
```

3. **เพิ่ม Remote Repository:**
```bash
git remote add origin https://github.com/Chiraphong20/checkin.git
```

4. **เพิ่มไฟล์ทั้งหมด:**
```bash
git add .
```

5. **Commit:**
```bash
git commit -m "Initial commit: Employee Check-in System"
```

6. **ตั้งค่า Branch:**
```bash
git branch -M main
```

7. **Push ขึ้น GitHub:**
```bash
git push -u origin main
```

## 🔐 การ Authentication

### วิธีที่ 1: Personal Access Token (แนะนำ)

1. ไปที่ GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
2. สร้าง token ใหม่ด้วยสิทธิ์ `repo`
3. เมื่อ push ให้ใช้ token แทน password

### วิธีที่ 2: GitHub CLI

```bash
gh auth login
```

### วิธีที่ 3: SSH Key

1. สร้าง SSH key:
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

2. เพิ่ม SSH key ไปที่ GitHub
3. เปลี่ยน remote URL เป็น SSH:
```bash
git remote set-url origin git@github.com:Chiraphong20/checkin.git
```

## ✅ ตรวจสอบหลัง Deploy

1. ไปที่ https://github.com/Chiraphong20/checkin
2. ตรวจสอบว่าไฟล์ทั้งหมดถูก push ขึ้นมาแล้ว
3. **ตรวจสอบว่าไฟล์ sensitive ไม่ถูก push:**
   - ❌ `serviceAccountKey.json` ต้องไม่เห็นใน repository
   - ❌ `.env` files ต้องไม่เห็นใน repository
   - ❌ `node_modules/` ต้องไม่เห็นใน repository

## 🔄 Update โค้ดในอนาคต

เมื่อต้องการ push การเปลี่ยนแปลงใหม่:

```bash
git add .
git commit -m "Description of changes"
git push
```

## 🆘 Troubleshooting

### Error: "remote origin already exists"
```bash
git remote remove origin
git remote add origin https://github.com/Chiraphong20/checkin.git
```

### Error: "Authentication failed"
- ตรวจสอบ username และ password/token
- ลองใช้ Personal Access Token แทน password

### Error: "Permission denied"
- ตรวจสอบว่ามีสิทธิ์ในการ push ไปยัง repository
- ตรวจสอบว่า repository ไม่ได้เป็น private และคุณไม่มีสิทธิ์

## 📞 คำถามเพิ่มเติม

หากมีปัญหาหรือคำถาม กรุณาเปิด issue บน GitHub










