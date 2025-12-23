const admin = require("firebase-admin");

// ---------------------------------------------------------
// 1. ตั้งค่าการเชื่อมต่อ (Credential Setup)
// ---------------------------------------------------------
// ส่วนนี้แก้ปัญหา Error: Cannot find module './serviceAccountKey.json'
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // กรณีรันบน GitHub Actions (Server) จะอ่านจาก Secret
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT from environment:", e);
    process.exit(1);
  }
} else {
  // กรณีรันในเครื่องตัวเอง (Local) จะอ่านจากไฟล์
  try {
    serviceAccount = require("./serviceAccountKey.json");
  } catch (e) {
    console.error("Error: ไม่พบไฟล์ serviceAccountKey.json และไม่มี Environment Variable");
    console.error("คำแนะนำ: หากรันบน Server ต้องตั้งค่า Secret 'FIREBASE_SERVICE_ACCOUNT'");
    process.exit(1);
  }
}

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// ---------------------------------------------------------
// 2. ฟังก์ชันหลัก (Main Logic)
// ---------------------------------------------------------
async function autoCutoff() {
  try {
    // --- ตั้งค่าเวลา (Timezone: Asia/Bangkok) ---
    // ใช้ toLocaleString เพื่อให้แน่ใจว่าเป็นเวลาไทยเสมอ ไม่ว่า Server จะอยู่ที่ไหน
    const now = new Date();
    const thaiTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
    const thaiDate = new Date(thaiTimeStr);

    // จัดรูปแบบวันที่ YYYY-MM-DD
    const year = thaiDate.getFullYear();
    const month = String(thaiDate.getMonth() + 1).padStart(2, '0');
    const day = String(thaiDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    console.log(`[Auto-Cutoff] เริ่มประมวลผลสำหรับวันที่: ${todayStr} (เวลาไทย)`);

    // --- เช็ควันเสาร์-อาทิตย์ ---
    const dayOfWeek = thaiDate.getDay(); // 0 = อาทิตย์, 6 = เสาร์
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log("[Auto-Cutoff] วันนี้วันเสาร์/อาทิตย์ -> จบการทำงาน (ไม่เช็คขาดงาน)");
      return; 
    }

    // --- เช็ควันหยุดนักขัตฤกษ์ (จาก Database) ---
    const holidayDoc = await db.collection("holidays").doc(todayStr).get();
    if (holidayDoc.exists) {
      console.log(`[Auto-Cutoff] วันนี้วันหยุดนักขัตฤกษ์ (${holidayDoc.data().name}) -> จบการทำงาน`);
      return;
    }

    // ---------------------------------------------------------
    // 3. ดึงข้อมูล (Fetch Data)
    // ---------------------------------------------------------
    // ดึงพนักงานทั้งหมดที่ยังทำงานอยู่ (status != 'ลาออก')
    const employeesSnapshot = await db.collection("employees").get();
    
    // ดึงรายการคนที่เช็คอินวันนี้แล้ว
    const checkinsSnapshot = await db
      .collection("employee_checkin")
      .where("date", "==", todayStr)
      .get();
    
    // ดึงรายการคนที่ลาวันนี้ (Approved)
    // หมายเหตุ: Query นี้สำหรับกรณีลาวันเดียวจบ ถ้ามีการลาข้ามวัน (Range) อาจต้องปรับ Query เพิ่มเติม
    const leavesSnapshot = await db
      .collection("employee_leave")
      .where("date", "==", todayStr)
      .where("status", "==", "Approved")
      .get();

    // สร้าง Set เก็บ ID ของคนที่ "รอด" (มาทำงาน หรือ ลาแล้ว)
    const activeEmployeeIds = new Set();
    
    checkinsSnapshot.forEach((doc) => activeEmployeeIds.add(doc.data().employeeId));
    leavesSnapshot.forEach((doc) => activeEmployeeIds.add(doc.data().employeeId));

    // ---------------------------------------------------------
    // 4. บันทึกคนขาดงาน (Process Absentees)
    // ---------------------------------------------------------
    const batch = db.batch();
    let absentCount = 0;

    employeesSnapshot.forEach((doc) => {
      const empData = doc.data();
      const empId = doc.id; 

      // กรองเฉพาะพนักงานที่ Active (เผื่อมี flag deleted หรือ resigned)
      // ถ้าใน DB คุณไม่มี field status ก็ข้ามบรรทัดนี้ได้
      if (empData.status === 'Resigned' || empData.isResigned) return;

      // ถ้ายังไม่มีชื่อในรายการ เช็คอิน หรือ ลา
      if (!activeEmployeeIds.has(empId)) {
        
        // สร้าง Document ID แบบระบุวัน ป้องกันการบันทึกซ้ำ
        const docId = `${empId}_${todayStr}`; 
        const checkinRef = db.collection("employee_checkin").doc(docId);

        // กำหนดค่าปรับ (Logic ตาม Snippet เดิมของคุณ: แผนก 01 ไม่เสียค่าปรับ)
        const fineAmount = (empData.department === "01") ? 0 : 500; // แก้ไข 500 เป็นยอดที่คุณต้องการ

        batch.set(checkinRef, {
          employeeId: empId,
          employeeCode: empData.employeeCode || "", 
          name: empData.name || "Unknown",
          department: empData.department || "",
          branch: empData.branch || "",
          date: todayStr,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          
          status: "ขาดงาน",    // สถานะหลัก
          isAutoAbsent: true,  // Flag ระบบ
          
          checkinTime: "-",    // ใส่ขีดไว้เพื่อความสวยงามใน Table
          checkoutTime: "-",
          
          fine: fineAmount,    // ค่าปรับ
          lateMinutes: 0
        });

        absentCount++;
      }
    });

    // ---------------------------------------------------------
    // 5. Commit (บันทึกลง Database)
    // ---------------------------------------------------------
    if (absentCount > 0) {
      await batch.commit();
      console.log(`[Auto-Cutoff] บันทึกสถานะ 'ขาดงาน' สำเร็จจำนวน: ${absentCount} คน`);
    } else {
      console.log("[Auto-Cutoff] ยอดเยี่ยม! วันนี้ไม่มีใครขาดงาน (หรือมีข้อมูลครบแล้ว)");
    }

  } catch (error) {
    console.error("[Auto-Cutoff] Fatal Error:", error);
    process.exit(1); // ส่ง exit code 1 เพื่อให้ GitHub Actions แจ้งเตือนว่า Failed
  }
}

// เรียกทำงาน
autoCutoff();