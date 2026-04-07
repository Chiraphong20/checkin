# ER Diagram ของระบบ (Entity-Relationship Diagram)

แผนภาพความสัมพันธ์ (ER Diagram) ของตารางข้อมูลหลักที่ใช้งานในระบบ Check-in

```mermaid
erDiagram
    USERS {
        int id PK
        varchar username UK
        varchar password "Hashed Password"
        varchar firstName
        varchar lastName
        varchar position
        decimal baseSalary
        string role "ADMIN, EMPLOYEE"
        timestamp createdAt
    }

    CHECK_INS {
        int id PK
        int user_id FK
        date workDate
        datetime checkInTime
        datetime checkOutTime
        varchar status "ON_TIME, LATE, ABSENT"
        varchar note "หมายเหตุจาก Admin เวลาแก้ Manual"
    }

    PAYROLL_REPORTS {
        int id PK
        int user_id FK
        varchar month_year
        int totalHours
        int lateCount
        decimal netAmount
        timestamp generatedAt
    }

    %% Relationships
    USERS ||--o{ CHECK_INS : "ลงเวลา (has)"
    USERS ||--o{ PAYROLL_REPORTS : "มีรายงาน (receives)"
```

### คำอธิบายโครงสร้างตารางหลัก:
1. **USERS**: จัดเก็บข้อมูลพนักงาน ไม่ว่าจะเป็นระดับผู้ดูแล (Admin) หรือพนักงานทั่วไป (Employee) 
2. **CHECK_INS**: จัดเก็บรายการลงเวลาทำงานแต่ละวัน (`checkInTime` และ `checkOutTime`) พร้อมสถานะการเข้างาน
3. **PAYROLL_REPORTS**: จัดเก็บข้อมูลสรุปรายงานเงินเดือนประจำเดือน ที่ประมวลผลมาจากตาราง CHECK_INS
