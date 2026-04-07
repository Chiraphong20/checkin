# Class Diagram ของระบบ (System Class Diagram)

เอกสารนี้แสดงโครงสร้างออบเจ็กต์/คลาสระดับแอปพลิเคชันหลักของ Employee Check-in 

```mermaid
classDiagram
    class User {
        <<Abstract>>
        +int id
        +String username
        +String firstName
        +String lastName
        +String password
        +Role role
        +login()
        +viewProfile()
    }

    class Admin {
        +manageEmployee()
        +addManualCheckIn()
        +viewPayrollReport()
        +exportReport()
    }

    class Employee {
        +String position
        +decimal baseSalary
        +checkIn()
        +checkOut()
        +viewMyCheckInHistory()
    }

    class CheckInRecord {
        +int id
        +Date workDate
        +DateTime checkInTime
        +DateTime checkOutTime
        +String status
        +String note
        +calculateWorkedHours()
    }

    class PayrollReport {
        +int id
        +String monthYear
        +int totalWorkedHours
        +int lateCount
        +decimal netAmount
        +generateReport()
    }

    %% Relationships
    User <|-- Admin : "Inherits"
    User <|-- Employee : "Inherits"

    Employee "1" -- "0..*" CheckInRecord : "makes"
    Admin "1" -- "0..*" CheckInRecord : "can adjust (manual)"
    
    Employee "1" -- "0..*" PayrollReport : "receives"
    Admin "1" -- "0..*" PayrollReport : "generates"
```

---

### คำอธิบายโครงสร้างคลาส (Class Descriptions)

1. **User (Abstract)**
   - คลาสแม่สำหรับเก็บข้อมูลพื้นฐานของพนักงานในระบบ (username, password, name)

2. **Admin** (สืบทอดจาก User)
   - ผู้ดูแลระบบที่มีอำนาจในการจัดการบัญชีพนักงาน (`manageEmployee`), ปรับการลงเวลาในกรณ์ลืมลงเวลา (`addManualCheckIn`), และสร้างรายงานเงินเดือน 

3. **Employee** (สืบทอดจาก User)
   - พนักงานทั่วไป ทำหน้าที่หลักคือปุ่มกด `checkIn()` และ `checkOut()` พร้อมทั้งดูประวัติการเข้างานของตนเอง

4. **CheckInRecord**
   - ตัวแทนของการลงเวลาแต่ละวัน บันทึกเวลาเข้า-ออกอย่างชัดเจน

5. **PayrollReport**
   - คลาสสรุปข้อมูลที่รวมเข้าด้วยกันเพื่อออกยอดเงินเดือนปลายงวด
