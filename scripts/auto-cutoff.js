// ⚠️ ไฟล์นี้สำหรับรันบน Server/GitHub Actions เท่านั้น ห้ามใช้ในหน้าเว็บ React
const admin = require("firebase-admin");
const dayjs = require("dayjs");
// ติดตั้ง Plugin และ Locale
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Bangkok'); // กำหนด Timezone เริ่มต้นเป็น Bangkok

// 1. ตั้งค่า Key (เราจะดึงจาก GitHub Secrets เพื่อความปลอดภัย)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runCutoff() {
  // ดึงเวลาปัจจุบันใน Bangkok Time
  const currentTimeThai = dayjs().tz('Asia/Bangkok'); 
  const todayStr = currentTimeThai.format("YYYY-MM-DD");
  const timestampStr = currentTimeThai.format("YYYY-MM-DD HH:mm:ss");
  
  console.log(`Starting Cutoff check for: ${todayStr}`);

  try {
    // 2. ดึงเวลาตัดยอดจาก Setting Page (Firestore)
    let cutoffHour = 17; // Default 17:00
    let cutoffMinute = 0; // Default 17:00
    let fine = 50;

    const settingDoc = await db.collection("settings").doc("checkin").get();
    if(settingDoc.exists) {
      // ดึงเวลาตัดยอดจาก field 'checkoutTime' (เช่น "17:00")
      const timeStr = settingDoc.data().checkoutTime || "17:00";
      [cutoffHour, cutoffMinute] = timeStr.split(':').map(Number);
      fine = settingDoc.data().absentFine || 50;
    }
    
    // สร้างวัตถุเวลาตัดยอดใน Bangkok Time
    const cutoffTimeThai = currentTimeThai.hour(cutoffHour).minute(cutoffMinute).second(0).millisecond(0);
    
    console.log(`Configured Cutoff Time (Bangkok): ${cutoffHour.toString().padStart(2, '0')}:${cutoffMinute.toString().padStart(2, '0')}`);
    console.log(`Current Time (Bangkok): ${currentTimeThai.format("HH:mm")}`);
    
    // 3. เปรียบเทียบเวลา
    // ถ้าเวลาปัจจุบัน (17:05) ยังไม่ถึงเวลาตัดยอด (17:00) ให้ Abort
    if (currentTimeThai.isBefore(cutoffTimeThai)) {
      console.log("Current time is before the configured cutoff time. Aborting.");
      return;
    }
    
    // 4. ถ้าเวลาผ่านแล้ว ดำเนินการตัดยอด
    
    const empSnap = await db.collection("employees").get();
    const employees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const checkinSnap = await db.collection("employee_checkin").where("date", "==", todayStr).get();
    const checkinIds = checkinSnap.docs.map(doc => doc.data().employeeId);

    const leaveSnap = await db.collection("employee_leave").where("date", "==", todayStr).get();
    const leaveIds = leaveSnap.docs.map(doc => doc.data().employeeId);

    // 5. หาคนขาด
    const absentList = employees.filter(emp => {
      return !checkinIds.includes(emp.employeeId) && !leaveIds.includes(emp.employeeId);
    });

    console.log(`Found ${absentList.length} absent employees.`);

    if (absentList.length === 0) {
      console.log("No absentees today.");
      return;
    }

    // 6. บันทึกลง Firebase (Batch Write เพื่อความเร็ว)
    const batch = db.batch();
    
    absentList.forEach(emp => {
      const newRef = db.collection("employee_checkin").doc(); // Auto ID
      batch.set(newRef, {
        employeeId: emp.employeeId,
        name: emp.name,
        department: emp.department || "",
        branch: emp.branch || "",
        date: todayStr,
        checkinTime: "-",
        checkoutTime: "-",
        timestamp: timestampStr,
        status: "ขาดงาน",
        fine: fine,
        isAutoAbsent: true
      });
    });

    await batch.commit();
    console.log("✅ Successfully committed absentees to Firestore.");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1); // แจ้ง GitHub ว่า Error
  }
}

runCutoff();