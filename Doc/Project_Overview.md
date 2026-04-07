# บทนำและภาพรวมโครงการ
## ระบบ Employee Check-in & Payroll System

**ชื่อโครงการ:** Check_inPJ  

---

## 1. วัตถุประสงค์ของโครงการ
1. **พัฒนาระบบลงเวลาทำงาน** ผ่านเว็บแอปพลิเคชันที่ใช้งานง่าย
2. **พัฒนาระบบ Admin Dashboard** เพื่อให้ HR และผู้บริหารจัดการข้อมูลพนักงานได้
3. **คำนวณเงินเดือนอัตโนมัติ** ตัดปัญหาการคิดชั่วโมงการทำงานด้วยมือ
4. **รวมศูนย์ข้อมูล** ช่วยให้ตรวจสอบเวลาและประวัติพนักงานได้ครบถ้วนในที่เดียว

---

## 2. ขอบเขตของโครงการ

### 2.1 สิ่งที่อยู่ในขอบเขต (In Scope)

| หมวด | รายละเอียด |
| :--- | :--- |
| **ระบบพนักงาน** | เข้าสู่ระบบ, ลงเวลาเข้า-ออกงาน, ดูประวัติการลงเวลาส่วนตัว, แก้ไขโปรไฟล์ |
| **ระบบ Admin** | จัดการผู้ใช้งาน (CRUD พนักงาน), ลงเวลาแทนพนักงาน (Manual Check-in) |
| **รายงาน** | การออกรายงานเงินเดือน (Payroll Report), สรุปการทำงานรายบุคคล |
| **ความปลอดภัย** | JWT Authentication, Role-based Access (Admin / Employee) |

### 2.2 สิ่งที่ไม่อยู่ในขอบเขต (Out of Scope)
- แอปพลิเคชันมือถือแบบ Native (iOS/Android)
- ระบบเชื่อมต่อกับเครื่องสแกนลายนิ้วมือโดยตรง (เป็น Web check-in แมนวล)

---

## 3. ภาพรวมระบบ (System Overview)

### 3.1 สถาปัตยกรรมระบบ
ระบบเป็น **Full-Stack Web Application**

```mermaid
flowchart TD
    subgraph FE["☁️ Frontend (React Vite)"]
        EMP["พนักงาน (Employee Portal)"]
        ADMIN["แอดมิน (Admin Dashboard)"]
    end

    subgraph BE["🖥️ Backend (Node.js)"]
        API["Express Server\nJWT Auth | API Routes"]
    end

    subgraph DB["🗄️ Database"]
        MYSQL["Database Server"]
    end

    EMP -- REST API --> BE
    ADMIN -- REST API --> BE
    BE -- Queries --> DB
```

### 3.2 ผู้ใช้งานของระบบ
| กลุ่มผู้ใช้ | ช่องทางการเข้าถึง | สิทธิ์การทำงาน |
| :--- | :--- | :--- |
| **พนักงาน (Employee)** | Web Browser | เข้าสู่ระบบ, ลงเวลา, ตรวจสอบเวลาทำงานตนเอง |
| **ผู้ดูแลระบบ (Admin)** | Web Browser | ทุกสิทธิ์ของพนักงาน + จัดการพนักงาน + ออกรายงาน |

---

## 4. เทคโนโลยีที่ใช้พัฒนา

| ชั้นระบบ | เทคโนโลยี |
| :--- | :--- |
| **Frontend Framework** | React.js (Vite) |
| **Styling** | Tailwind CSS / CSS3 |
| **Backend** | Node.js + Express |
| **Database** | MySQL / MongoDB (ขึ้นกับ Config) |
| **Auth** | JSON Web Token (JWT) |

---

## 5. เอกสารที่เกี่ยวข้อง

| เอกสาร | คำอธิบาย |
| :--- | :--- |
| [SRS.md](./SRS.md) | ความต้องการของระบบ (Software Requirements Specification) |
| [ER_Diagram.md](./ER_Diagram.md) | แผนภาพความสัมพันธ์ฐานข้อมูล |
| [Class_Diagram.md](./Class Diagram.md) | ภาพรวมคลาสภายในระบบ |
| [Data_Dictionary.md](./Data_Dictionary.md) | พจนานุกรมข้อมูลตารางและคอลัมน์ |
| [Master_Data.md](./Master_Data.md) | ข้อมูลคงที่และตั้งค่าพื้นฐานของระบบ |
