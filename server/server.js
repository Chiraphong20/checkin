const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// (ตรวจสอบว่าไฟล์ serviceAccountKey.json อยู่ในโฟลเดอร์ server)
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());
const port = 5000;


// --- (โค้ดเดิม) API Dashboard ---
app.get('/api/dashboard-summary', async (req, res) => {
  try {
    const employeesRef = db.collection('employees');
    const employeesSnapshot = await employeesRef.get();

    if (employeesSnapshot.empty) {
      return res.json({ kpis: {}, tableData: [] });
    }
    const statuses = ['เข้างานปกติ', 'มาสาย', 'ขาดงาน', 'ลา (อนุมัติ)'];
    const locations = ['✔️ ในพื้นที่', '❌ นอกพื้นที่'];
    
    const tableData = employeesSnapshot.docs.map(doc => {
      const employee = doc.data();
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      let checkInTime = '-';
      let location = '-';
      let note = '-';

      if (randomStatus === 'เข้างานปกติ') {
        checkInTime = '07:55';
        location = locations[0];
      } else if (randomStatus === 'มาสาย') {
        checkInTime = '08:15';
        location = locations[Math.floor(Math.random() * locations.length)];
        note = 'มาสาย (หัก 20)';
      }
      
      return {
        key: doc.id,
        employeeId: employee.employeeId, // ⬅️ เพิ่ม employeeId ที่นี่
        name: employee.name,
        branch: employee.branch,
        status: randomStatus,
        checkInTime: checkInTime,
        location: location,
        note: note,
      };
    });
    const totalEmployees = employeesSnapshot.size;
    const checkedIn = tableData.filter(e => e.status === 'เข้างานปกติ' || e.status === 'มาสาย').length;
    const late = tableData.filter(e => e.status === 'มาสาย').length;
    const absentOrLeave = tableData.filter(e => e.status === 'ขาดงาน' || e.status.includes('ลา')).length;
    const outsideArea = tableData.filter(e => e.location === '❌ นอกพื้นที่').length;

    const kpiData = {
      total: totalEmployees,
      checkedIn: checkedIn,
      late: late,
      absent: absentOrLeave,
      outsideArea: outsideArea
    };
    res.json({
      kpis: kpiData,
      tableData: tableData
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).send('Server Error');
  }
});


// --- (โค้ดเดิม) API สำหรับหน้ารายงาน (ยังเป็น Mockup) ---
app.get('/api/payroll-report', async (req, res) => {
  try {
    const payrollData = [
      { key: '1', name: 'นาย ก.', branch: 'สาขา A', late_20: 0, late_50: 0, absent: 0, leave: 0, total_deduction: 0 },
      { key: '2', name: 'น.ส. ข.', branch: 'สาขา B', late_20: 3, late_50: 1, absent: 0, leave: 0, total_deduction: 110 },
      { key: '3', name: 'น.ส. ช.', branch: 'สาขา B', late_20: 0, late_50: 0, absent: 0, leave: 1, total_deduction: 50 },
    ];
    res.json(payrollData);
  } catch (error) {
    console.error('Error fetching payroll data:', error);
    res.status(500).send('Server Error');
  }
});

// --- (โค้ดเดิม) API สำหรับดึงพนักงานทั้งหมด ---
app.get('/api/employees', async (req, res) => {
  try {
    const snapshot = await db.collection('employees').orderBy('employeeId', 'asc').get();
    if (snapshot.empty) {
      return res.json([]);
    }
    const employees = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).send('Server Error');
  }
});

// --- (โค้ดเดิม) API สำหรับเพิ่มพนักงานใหม่ (สร้างรหัสอัตโนมัติ) ---
app.post('/api/employees', async (req, res) => {
  try {
    const { name, phone, department, branch, joinDate } = req.body;

    if (!name || !phone || !department || !branch || !joinDate) {
      return res.status(400).send('Missing required fields');
    }

    // --- 3. Logic การสร้าง Employee ID ---
    const yearGregorian = new Date(joinDate).getFullYear();
    const yearBuddhist = yearGregorian + 543;
    const yy = String(yearBuddhist).slice(-2);
    const dd = department;

    const prefix = `${yy}-${dd}-`;
    
    const employeesRef = db.collection('employees');
    // Query ต้องใช้ employeeId: 'asc' เพื่อให้ orderBy(employeeId, 'desc') ทำงานได้ตามหลัก index
    const query = employeesRef
      .where('employeeId', '>=', prefix)
      .where('employeeId', '<', `${yy}-${String(parseInt(dd) + 1).padStart(2, '0')}-`)
      .orderBy('employeeId', 'desc')
      .limit(1);
      
    const snapshot = await query.get();
    
    let newRunningNumber = 1;
    if (!snapshot.empty) {
      const lastEmployee = snapshot.docs[0].data();
      const lastId = lastEmployee.employeeId;
      // ต้องตรวจสอบก่อนว่า lastId มีรูปแบบที่ถูกต้อง
      if (lastId && lastId.split('-').length === 3) {
        const lastRunningNumber = parseInt(lastId.split('-')[2]);
        newRunningNumber = lastRunningNumber + 1;
      }
    }
    
    const nnn = String(newRunningNumber).padStart(3, '0');
    const employeeId = `${prefix}${nnn}`;

    // 5. สร้าง Object พนักงานใหม่
    const newEmployee = {
      employeeId, 
      name,
      phone,
      department,
      branch,
      joinDate
    };

    // 6. เพิ่มข้อมูลลงใน Collection 'employees'
    const docRef = await db.collection('employees').add(newEmployee);

    res.status(201).json({
      id: docRef.id,
      ...newEmployee
    });

  } catch (error) {
    console.error('Error adding employee:', error);
    res.status(500).send('Server Error');
  }
});

// --- ⬇️ (ใหม่) API สำหรับแก้ไขข้อมูลพนักงาน (PUT) ---
app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, department, branch, joinDate, employeeId } = req.body;
    
    // 1. ตรวจสอบ Field ที่จำเป็นสำหรับการแก้ไข
    if (!name || !phone || !department || !branch || !joinDate || !employeeId) {
      return res.status(400).send('Missing required fields for update');
    }

    // 2. ข้อมูลที่ต้องการอัปเดต
    const updatedEmployee = {
      employeeId,
      name,
      phone,
      department,
      branch,
      joinDate,
    };
    
    // 3. อัปเดตเอกสารใน Firestore
    await db.collection('employees').doc(id).update(updatedEmployee);

    res.status(200).json({ id, ...updatedEmployee });

  } catch (error) {
    console.error(`Error updating employee ${req.params.id}:`, error);
    res.status(500).send('Server Error');
  }
});

// --- ⬇️ (ใหม่) API สำหรับลบพนักงาน (DELETE) ---
app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. ลบเอกสารออกจาก Firestore
    await db.collection('employees').doc(id).delete();

    res.status(204).send(); // 204 No Content สำหรับการลบสำเร็จ

  } catch (error) {
    console.error(`Error deleting employee ${req.params.id}:`, error);
    res.status(500).send('Server Error');
  }
});


app.listen(port, () => {
  console.log(`Backend server (เชื่อมต่อ Firebase แล้ว) รันที่ http://localhost:${port}`);
});
