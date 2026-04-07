# พจนานุกรมข้อมูล (Data Dictionary)

เอกสารนี้รวบรวมรายละเอียดโครงสร้างของตารางในฐานข้อมูล (Physical Data)

---

## 1. ตาราง: `users` 
**คำอธิบาย:** จัดเก็บข้อมูลผู้ใช้งานระบบทั้งหมด (Admin และ พนักงาน)

| ชื่อคอลัมน์ (Field) | ชนิดข้อมูล (Type) | เงื่อนไข (Constraints) | ค่าเริ่มต้น (Default) | คำอธิบาย (Description) |
| :--- | :--- | :--- | :--- | :--- |
| `id` | int(11) | PK, AUTO_INCREMENT | - | รหัสผู้ใช้งาน (Primary Key) |
| `username` | varchar(50) | UK, NOT NULL | - | ชื่อผู้ใช้สำหรับระบบ Login |
| `password` | varchar(255) | NOT NULL | - | รหัสผ่าน (เข้ารหัส bcrypt) |
| `firstName` | varchar(100) | NOT NULL | - | ชื่อพนักงาน |
| `lastName` | varchar(100) | NOT NULL | - | นามสกุล |
| `position` | varchar(100) | NULL | - | ตำแหน่งงาน |
| `baseSalary`| decimal(10,2)| NOT NULL | 0.00 | เงินเดือนฐานตั้งต้น |
| `role` | enum | NOT NULL | 'EMPLOYEE' | สิทธิ์ผู้ใช้งาน (`ADMIN` หรือ `EMPLOYEE`) |
| `createdAt` | timestamp | NULL | CURRENT_TIMESTAMP | วันและเวลาที่สร้างข้อมูล |

---

## 2. ตาราง: `check_ins`
**คำอธิบาย:** เก็บบันทึกข้อมูลเวลาเข้างานและออกงานในแต่ละวัน

| ชื่อคอลัมน์ (Field) | ชนิดข้อมูล (Type) | เงื่อนไข (Constraints) | ค่าเริ่มต้น (Default) | คำอธิบาย (Description) |
| :--- | :--- | :--- | :--- | :--- |
| `id` | int(11) | PK, AUTO_INCREMENT | - | รหัสบันทึกการประทับเวลา |
| `user_id` | int(11) | FK, NOT NULL | - | อ้างอิงรหัสพนักงาน (users.id) |
| `workDate` | date | NOT NULL | - | วันที่ลงเวลาทำการ |
| `checkInTime` | datetime | NULL | - | เวลาที่กดเข้างาน |
| `checkOutTime`| datetime | NULL | - | เวลาที่กดออกงาน |
| `status` | varchar(50) | NULL | 'ON_TIME' | สถานะการเข้างาน (เช่น LATE, ON_TIME) |
| `note` | text | NULL | - | หมายเหตุ (หาก Admin เป็นคนแก้ไขเวลา) |

---

## 3. ตาราง: `payroll_reports`
**คำอธิบาย:** จัดเก็บข้อมูลสรุปชั่วโมงและเงินเดือนประจำเดือน

| ชื่อคอลัมน์ (Field) | ชนิดข้อมูล (Type) | เงื่อนไข (Constraints) | ค่าเริ่มต้น (Default) | คำอธิบาย (Description) |
| :--- | :--- | :--- | :--- | :--- |
| `id` | int(11) | PK, AUTO_INCREMENT | - | รหัสรายงาน |
| `user_id` | int(11) | FK, NOT NULL | - | อ้างอิงรหัสพนักงาน |
| `month_year`| varchar(20) | NOT NULL | - | ระบุเดือนและปี (เช่น 04/2026) |
| `totalHours`| int(11) | NOT NULL | 0 | รวมชั่วโมงทำงาน (คำนวณจาก check_ins) |
| `lateCount` | int(11) | NOT NULL | 0 | จำนวนครั้งที่มาสาย |
| `netAmount` | decimal(10,2)| NOT NULL | 0.00 | ยอดสุทธิในเดือนนั้น |
| `generatedAt`| timestamp | NULL | CURRENT_TIMESTAMP | เวลาที่สร้างรายงานนี้ขึ้น |
