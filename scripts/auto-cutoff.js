const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // ตรวจสอบ path ให้ถูกต้อง

// Initialize Firebase Admin (ถ้ายังไม่ได้ init ในไฟล์อื่น)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function autoCutoff() {
  try {
    // ---------------------------------------------------------
    // 1. จัดการเรื่องเวลา (Timezone: Asia/Bangkok)
    // ---------------------------------------------------------
    // สร้าง Date Object ที่เป็นเวลาปัจจุบันของไทย
    const now = new Date();
    const thaiTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
    const thaiDate = new Date(thaiTimeStr);

    // สร้าง String วันที่รูปแบบ YYYY-MM-DD (ตามเวลาไทย)
    const year = thaiDate.getFullYear();
    const month = String(thaiDate.getMonth() + 1).padStart(2, '0');
    const day = String(thaiDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    console.log(`[Auto-Cutoff] กำลังประมวลผลวันที่: ${todayStr} (Thai Time)`);

    // ---------------------------------------------------------
    // 2. เช็ควันหยุดเสาร์-อาทิตย์ (Weekend Check)
    // ---------------------------------------------------------
    const dayOfWeek = thaiDate.getDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log("[Auto-Cutoff] วันนี้วันหยุดสุดสัปดาห์ (เสาร์/อาทิตย์) -> จบการทำงาน");
      return; 
    }

    // ---------------------------------------------------------
    // 3. เช็ควันหยุดนักขัตฤกษ์ (Holiday Check)
    // ---------------------------------------------------------
    // ต้องมั่นใจว่าใน DB collection 'holidays' ใช้ document ID เป็น format 'YYYY-MM-DD'
    const holidayDoc = await db.collection("holidays").doc(todayStr).get();
    if (holidayDoc.exists) {
      console.log(`[Auto-Cutoff] วันนี้วันหยุดนักขัตฤกษ์ (${holidayDoc.data().name || 'Unknown'}) -> จบการทำงาน`);
      return;
    }

    // ---------------------------------------------------------
    // 4. ดึงข้อมูลพนักงาน และ การลงเวลาที่มีอยู่แล้ว
    // ---------------------------------------------------------
    const employeesSnapshot = await db.collection("employees").get();
    const checkinsSnapshot = await db
      .collection("employee_checkin")
      .where("date", "==", todayStr)
      .get();
    
    // ดึงข้อมูลการลาที่ครอบคลุมวันนี้
    // หมายเหตุ: Logic การลานี้เช็คแบบง่าย (ลาตรงวัน) 
    // หากระบบลาเก็บเป็น range (startDate, endDate) ต้องปรับ query เพิ่มเติม
    const leavesSnapshot = await db
      .collection("employee_leave")
      .where("date", "==", todayStr) 
      .where("status", "==", "Approved") // เฉพาะที่อนุมัติแล้ว
      .get();

    // สร้าง Set ของ ID คนที่มาทำงานแล้ว หรือ ลาแล้ว
    const activeEmployeeIds = new Set();
    
    checkinsSnapshot.forEach((doc) => {
      activeEmployeeIds.add(doc.data().employeeId);
    });
    
    leavesSnapshot.forEach((doc) => {
      activeEmployeeIds.add(doc.data().employeeId);
    });

    // ---------------------------------------------------------
    // 5. หาคนที่ "ขาดงาน" และบันทึกข้อมูล
    // ---------------------------------------------------------
    const batch = db.batch();
    let absentCount = 0;

    employeesSnapshot.forEach((doc) => {
      const empData = doc.data();
      const empId = doc.id; // หรือ empData.employeeId ตามโครงสร้าง DB

      // ถ้าพนักงานยัง active และ ยังไม่มีชื่อใน checkin/leave
      if (!activeEmployeeIds.has(empId)) {
        
        // สร้าง ID ของ Document ให้ unique ตามวันและคน (ป้องกันการรันซ้ำแล้วข้อมูลเบิ้ล)
        const docId = `${empId}_${todayStr}`; 
        const checkinRef = db.collection("employee_checkin").doc(docId);

        batch.set(checkinRef, {
          employeeId: empId,
          employeeCode: empData.employeeCode || "", // เก็บเผื่อไว้แสดงผล
          name: empData.name || "Unknown",
          date: todayStr,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: "ขาดงาน",    // สถานะที่จะไปโชว์ใน Dashboard
          isAutoAbsent: true,  // Flag บอกว่าระบบตัดให้อัตโนมัติ
          fine: 0,             // ค่าปรับ (ถ้ามีกฎปรับเงิน ใส่จำนวนเงินตรงนี้ เช่น 500)
          lateMinutes: 0
        });

        absentCount++;
      }
    });

    // ---------------------------------------------------------
    // 6. Commit ลง Database
    // ---------------------------------------------------------
    if (absentCount > 0) {
      await batch.commit();
      console.log(`[Auto-Cutoff] บันทึกสถานะ 'ขาดงาน' สำเร็จ: ${absentCount} คน`);
    } else {
      console.log("[Auto-Cutoff] ไม่มีพนักงานขาดงานในวันนี้ (ครบทุกคน หรือ ลาหมด)");
    }

  } catch (error) {
    console.error("[Auto-Cutoff] Error:", error);
  }
}

// เรียกใช้งานฟังก์ชัน
autoCutoff();