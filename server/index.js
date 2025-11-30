const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Bangkok");


const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(express.json());
const port = 5000;

// --- Helper Function: จำแนกสถานะตามเวลาเข้างาน ---
// กฎ: 8:00-8:05 (ปกติ), 8:06-8:15 (หัก 20), 8:16-8:30 (หัก 50), 8:31+ (ถือเป็นขาด/วันลา)
function classifyCheckIn(checkInTime) {
  if (!checkInTime || checkInTime === '-') {
    return { type: 'NoCheckIn', deduction: 0 };
  }

  const [hours, minutes] = checkInTime.split(':').map(Number);
  const checkInMinutes = hours * 60 + minutes; // 8:00 = 480

  // 08:06 - 08:15 → หัก 20
  if (checkInMinutes >= 486 && checkInMinutes <= 495) {
    return { type: 'Late20', deduction: 20 };
  }
  // 08:16 - 08:30 → หัก 50
  else if (checkInMinutes >= 496 && checkInMinutes <= 510) {
    return { type: 'Late50', deduction: 50 };
  }
  // 08:31+ → ถือว่าเป็นลา (จะหัก 50 บาทวันถัดไป)
  else if (checkInMinutes >= 511) {
    return { type: 'LeaveFromLate', deduction: 50, nextDay: true }; 
  }
  // 08:00 - 08:05 → ปกติ
  else {
    return { type: 'Present', deduction: 0 };
  }
}



// --- 🌟 แก้ไข: API Dashboard (ใช้ข้อมูล Attendance จริง ณ วันนี้) ---
app.get('/api/dashboard-summary', async (req, res) => {
    try {
        // กำหนดวันที่ปัจจุบันในรูปแบบ YYYY-MM-DD (Bangkok Time)
        const todayDate = dayjs().tz("Asia/Bangkok").format('YYYY-MM-DD');

        // 1. ดึงข้อมูลพนักงานทั้งหมด
        const employeesRef = db.collection('employees');
        const employeesSnapshot = await employeesRef.get();
        const employeesList = employeesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

        // 2. ดึงข้อมูลการเข้างานของวันนี้
        const attendanceRef = db.collection('attendance');
        const attendanceQuery = attendanceRef.where('date', '==', todayDate);
        const attendanceSnapshot = await attendanceQuery.get();
        
        // จัดเก็บเป็น Map เพื่อเข้าถึงง่ายด้วย employeeId
        const attendanceMap = {};
        attendanceSnapshot.docs.forEach(doc => {
            const record = doc.data();
            attendanceMap[record.employeeId] = record;
        });

        // 3. ประมวลผลและสร้างตาราง (Merge Employee Data + Attendance)
        const tableData = employeesList.map(employee => {
            const attendance = attendanceMap[employee.employeeId];
            let status = 'ขาดงาน'; // ค่าเริ่มต้น: ขาดงาน (Absent)
            let checkInTime = '-';
            let location = '-';
            let note = 'ไม่พบการบันทึกการเข้างาน'; // หมายเหตุเริ่มต้น

            if (attendance) {
                checkInTime = attendance.checkInTime || '-';
                
                // กำหนด Location
                if (attendance.location === 'in-area') {
                    location = '✔️ ในพื้นที่';
                } else if (attendance.location === 'out-of-area') {
                    location = '❌ นอกพื้นที่';
                } else {
                    location = '-'; 
                }

                // กำหนด Status ตามที่บันทึก
                if (attendance.status === 'absent') {
                    status = 'ขาดงาน';
                    note = 'ขาดงานตามบันทึก';
                } else if (attendance.status === 'leave') {
                    status = 'ลา (อนุมัติ)';
                    note = 'วันลาตามบันทึก';
                } else if (attendance.status === 'late' || attendance.status === 'present') {
                    // Check-in/Late: ใช้ classifyCheckIn เพื่อจำแนกรายละเอียด
                    const classification = classifyCheckIn(checkInTime);

                    if (classification.type === 'Present') {
                        status = 'เข้างานปกติ';
                        note = '-';
                    } else if (classification.type === 'Late20') {
                        status = 'มาสาย';
                        note = 'มาสาย (หัก 20)';
                    } else if (classification.type === 'Late50') {
                        status = 'มาสาย';
                        note = 'มาสาย (หัก 50)';
                    } else if (classification.type === 'AbsentFromLate') {
                        status = 'ขาดงาน'; // มาสาย 8:31+ ถือเป็นขาดงาน
                        note = 'มาสายเกินกำหนด (ถือเป็นขาด)';
                    } else { 
                        status = 'ขาดงาน'; // กรณีไม่พบเวลา Check-in แต่มีสถานะ Present/Late 
                        note = 'ไม่พบเวลา Check-in';
                    }
                }
            }

            return {
                key: employee.id || employee.employeeId,
                employeeId: employee.employeeId,
                name: employee.name,
                branch: employee.branch,
                status: status,
                checkInTime: checkInTime,
                location: location,
                note: note,
            };
        });

        // 4. คำนวณ KPI Summary
        const totalEmployees = employeesList.length;
        const checkedIn = tableData.filter(e => e.status === 'เข้างานปกติ' || e.status === 'มาสาย').length;
        const late = tableData.filter(e => e.status === 'มาสาย').length;
        const absentOrLeave = tableData.filter(e => e.status === 'ขาดงาน' || e.status.includes('ลา')).length;
        
        // นับเฉพาะคนที่ Check-in แล้ว (เข้างานปกติ/มาสาย) แต่อยู่ '❌ นอกพื้นที่'
        const outsideArea = tableData.filter(e => 
            (e.status === 'เข้างานปกติ' || e.status === 'มาสาย') && 
            e.location === '❌ นอกพื้นที่'
        ).length;

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


// --- API สำหรับหน้ารายงาน (Mockup) (ไม่เปลี่ยนแปลง) ---
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

// --- API สำหรับสรุปยอดเงินเดือนตามช่วงวันที่ (POST /api/payroll-summary) ---
app.post('/api/payroll-summary', async (req, res) => {
  try {
    const { startDate: reqStartDate, endDate: reqEndDate } = req.body;
    
    if (!reqStartDate || !reqEndDate) {
      return res.status(400).send('Missing startDate or endDate');
    }

    // แปลงวันที่ที่รับเข้ามาเป็น Dayjs objects สำหรับการเปรียบเทียบ
    const startRange = dayjs(reqStartDate).tz("Asia/Bangkok").startOf('day');
    const endRange = dayjs(reqEndDate).tz("Asia/Bangkok").endOf('day');

    if (startRange.valueOf() > endRange.valueOf()) {
        return res.status(400).send('Start date cannot be after end date.');
    }

    // --- การตั้งค่าสำหรับการคำนวณเงินเดือน (Mock) ---
    const SALARY_RATE_PER_DAY = 1000; // อัตราหักเงินสำหรับขาดงาน/ลา/มาสายหนัก 
    const BASE_SALARY = 30000;
    
    // 1. ดึงข้อมูลพนักงานทั้งหมด (จาก Firestore Collection: 'employees')
    const employeesSnapshot = await db.collection('employees').get();
    const employeesList = employeesSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      baseSalary: BASE_SALARY,
    }));

    // 2. ดึงข้อมูลการเข้างานตามช่วงวันที่ที่ร้องขอ (จาก Firestore Collection: 'attendance')
    const startDateString = startRange.format('YYYY-MM-DD');
    const endDateString = endRange.format('YYYY-MM-DD');

    const attendanceRef = db.collection('attendance');
    const attendanceQuery = attendanceRef
        .where('date', '>=', startDateString)
        .where('date', '<=', endDateString);
        
    // ถอด .orderBy('date', 'asc') ออกเพื่อแก้ไขปัญหา Index Conflict
    const attendanceSnapshot = await attendanceQuery.get(); 
    
    const attendanceRecords = attendanceSnapshot.docs.map(doc => doc.data());
    
    // 🔍 LOG: ตรวจสอบจำนวนรายการที่ดึงได้
    console.log(`Fetched ${attendanceRecords.length} attendance records from Firestore between ${startDateString} and ${endDateString}`);

    // 3. สรุปผลลัพธ์รายพนักงาน
    const summaryMap = {};

    // Initialize summary for all employees
    employeesList.forEach(emp => {
        summaryMap[emp.employeeId] = {
            employeeId: emp.employeeId,
            name: emp.name,
            late20Count: 0, // มาสายหัก 20 บาท
            late50Count: 0, // มาสายหัก 50 บาท
            absentCount: 0, // ขาดงาน (จากสถานะ 'absent' หรือมาสาย 8:31+)
            leaveCount: 0,  // ลา (จากสถานะ 'leave')
            totalDeduction: 0, // ยอดหักรวม
        };
    });

    // Aggregate attendance data and apply new deduction rules
    attendanceRecords.forEach(record => {
      const empSummary = summaryMap[record.employeeId];
      if (!empSummary) return;
      
      if (record.status === 'absent') {
        // ขาดงานตามสถานะที่บันทึก
        empSummary.absentCount += 1;
        empSummary.totalDeduction += SALARY_RATE_PER_DAY; // หักเงินเต็มวัน
        // 🔍 LOG: บันทึกยอดหักขาดงาน
        console.log(`[DEDUCT:ABSENT] ${record.employeeId} on ${record.date}. Deduction: ${SALARY_RATE_PER_DAY}. New Total: ${empSummary.totalDeduction}`);
      } else if (record.status === 'leave') {
        // ลาตามสถานะที่บันทึก
        empSummary.leaveCount += 1;
        empSummary.totalDeduction += SALARY_RATE_PER_DAY; // หักเงินเต็มวัน (สมมติว่าเป็นลาไม่ได้รับเงิน)
        // 🔍 LOG: บันทึกยอดหักลา
        console.log(`[DEDUCT:LEAVE] ${record.employeeId} on ${record.date}. Deduction: ${SALARY_RATE_PER_DAY}. New Total: ${empSummary.totalDeduction}`);
      } else if (record.status === 'late' || record.status === 'present') {
        // ตรวจสอบเวลา Check-in เพื่อคำนวณการหักเงินมาสาย
        const classification = classifyCheckIn(record.checkInTime);
        
        if (classification.type === 'Late20') {
          empSummary.late20Count += 1;
          empSummary.totalDeduction += classification.deduction;
          // 🔍 LOG: บันทึกยอดหักมาสาย 20
          console.log(`[DEDUCT:LATE20] ${record.employeeId} on ${record.date} at ${record.checkInTime}. Deduction: ${classification.deduction}. New Total: ${empSummary.totalDeduction}`);
        } else if (classification.type === 'Late50') {
          empSummary.late50Count += 1;
          empSummary.totalDeduction += classification.deduction;
          // 🔍 LOG: บันทึกยอดหักมาสาย 50
          console.log(`[DEDUCT:LATE50] ${record.employeeId} on ${record.date} at ${record.checkInTime}. Deduction: ${classification.deduction}. New Total: ${empSummary.totalDeduction}`);
        } else if (classification.type === 'AbsentFromLate') {
          // Check-in >= 8:31, ถือเป็น Absent และหักเงินเต็มวัน
          empSummary.absentCount += 1;
          empSummary.totalDeduction += SALARY_RATE_PER_DAY;
          // 🔍 LOG: บันทึกยอดหักขาดงานจากการมาสายหนัก
          console.log(`[DEDUCT:ABSENT_FROM_LATE] ${record.employeeId} on ${record.date} at ${record.checkInTime}. Deduction: ${SALARY_RATE_PER_DAY}. New Total: ${empSummary.totalDeduction}`);
        }
        // 'Present' คือ หัก 0
      }
    });

    // 4. เตรียม Report Final
    const finalReport = Object.values(summaryMap).map(emp => {
      
      // รวมจำนวนมาสายทั้งหมด (หัก 20 และ 50) 
      const totalLateCount = emp.late20Count + emp.late50Count;
      
      return {
        employeeId: emp.employeeId,
        name: emp.name,
        lateCount: totalLateCount, // รวม late 20 + 50
        late20Count: emp.late20Count, // มาสายหัก 20 (ครั้ง)
        late50Count: emp.late50Count, // มาสายหัก 50 (ครั้ง)
        absentCount: emp.absentCount, // ขาดงานรวม (จากสถานะ 'absent' และจากมาสาย 8:31+)
        leaveCount: emp.leaveCount,
        totalDeduction: emp.totalDeduction, // ยอดหักรวมทั้งหมด
      };
    });
    
    // 🔍 LOG: บันทึกสรุปรายงานทั้งหมด
    console.log('Final Payroll Report Summary:', JSON.stringify(finalReport, null, 2));


    res.json(finalReport);

  } catch (error) {
    console.error('Error fetching payroll summary:', error);
    res.status(500).send('Server Error: Failed to process payroll summary logic.');
  }
});


// --- API สำหรับดึงพนักงานทั้งหมด (ไม่เปลี่ยนแปลง) ---
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

// --- API สำหรับเพิ่มพนักงานใหม่ (ไม่เปลี่ยนแปลง) ---
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

// --- API สำหรับแก้ไขข้อมูลพนักงาน (ไม่เปลี่ยนแปลง) ---
app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, department, branch, joinDate, employeeId } = req.body;
    
    if (!name || !phone || !department || !branch || !joinDate || !employeeId) {
      return res.status(400).send('Missing required fields for update');
    }

    const updatedEmployee = {
      employeeId,
      name,
      phone,
      department,
      branch,
      joinDate,
    };
    
    await db.collection('employees').doc(id).update(updatedEmployee);

    res.status(200).json({ id, ...updatedEmployee });

  } catch (error) {
    console.error(`Error updating employee ${req.params.id}:`, error);
    res.status(500).send('Server Error');
  }
});

// --- API สำหรับลบพนักงาน (ไม่เปลี่ยนแปลง) ---
app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.collection('employees').doc(id).delete();

    res.status(204).send();

  } catch (error) {
    console.error(`Error deleting employee ${req.params.id}:`, error);
    res.status(500).send('Server Error');
  }
});


app.listen(port, () => {
  console.log(`Backend server (เชื่อมต่อ Firebase แล้ว) รันที่ http://localhost:${port}`);
});
