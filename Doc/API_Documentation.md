# คู่มือการใช้งาน API (API Documentation)

เอกสารสำหรับนักพัฒนา Frontend เพื่อเชื่อมต่อระบบการนำข้อมูล (RESTful API) กับ Backend

---

## Base URL
เซิร์ฟเวอร์จะรันรับ API ที่: `http://localhost:5000/api`

---

## 1. หมวดหมู่ผู้ใช้งาน (Authentication)

### 1.1 เข้าสู่ระบบ (Login)
- **Endpoint:** `POST /auth/login`
- **Description:** ยืนยันตัวตนพนักงาน/แอดมิน เพื่อรับ JWT Token
- **Request Body (JSON):**
  ```json
  {
    "username": "emp01",
    "password": "password123"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Login Success",
    "token": "eyJhbGciOiJIUzI1...",
    "user": {
      "id": 1,
      "firstName": "Somchai",
      "role": "EMPLOYEE"
    }
  }
  ```
- **Response (401 Unauthorized):** ข้อมูลไม่ถูกต้อง

---

## 2. หมวดหมู่การลงเวลา (Check-In System)

*หมายเหตุ: ทุก Endpoint ในหมวดนี้ต้องแนบ Header:*
`Authorization: Bearer <Your_JWT_Token>`

### 2.1 บันทึกเวลาเข้างาน (Check-in)
- **Endpoint:** `POST /checkin/in`
- **Description:** กดเพื่อลงเวลาเข้างานระบบจะแสตมป์เวลาอัตโนมัติ
- **Request Body:** ว่าง (ส่งแค่ Token)
- **Response (200 OK):**
  ```json
  { "message": "Check-in successful", "checkInTime": "2026-04-07T09:00:00.000Z", "status": "ON_TIME" }
  ```

### 2.2 บันทึกเวลาเลิกงาน (Check-out)
- **Endpoint:** `POST /checkin/out`
- **Description:** กดเพื่อลงเวลาเลิกงาน
- **Request Body:** ว่าง (ส่งแค่ Token)
- **Response (200 OK):**
  ```json
  { "message": "Check-out successful", "checkOutTime": "2026-04-07T18:00:00.000Z" }
  ```

### 2.3 ดูประวัติการลงเวลาของตนเอง (My History)
- **Endpoint:** `GET /checkin/history`
- **Description:** ดึงข้อมูล Check-in/out ส่วนตัว
- **Response (200 OK):**
  ```json
  [
    { "date": "2026-04-07", "checkIn": "08:50", "checkOut": "18:05", "status": "ON_TIME" }
  ]
  ```

---

## 3. หมวดหมู่ผู้ดูแลระบบ (Admin Only)

*หมายเหตุ: ต้องเป็น Token ของบัญชีที่มี `role="ADMIN"` เท่านั้น*

### 3.1 ดึงรายการเวลาทำงานของพนักงานทุกคน
- **Endpoint:** `GET /admin/checkin-records`
- **Description:** ใช้แสดงตาราง Monitor ภาพรวมแบบ Real-time
- **Query Params:** `?date=2026-04-07`

### 3.2 ลงเวลาแมนนวล / แก้ไขเวลา (Manual Adjust)
- **Endpoint:** `PATCH /admin/checkin-records/:id`
- **Request Body (JSON):**
  ```json
  {
    "checkInTime": "09:00:00",
    "note": "ลืมกดตอนเช้า แอดมินแก้ให้"
  }
  ```
