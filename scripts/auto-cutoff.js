// ⚠️ ไฟล์นี้สำหรับรันบน Server/GitHub Actions เท่านั้น ห้ามใช้ในหน้าเว็บ React
const admin = require("firebase-admin");
const dayjs = require("dayjs");
require('dayjs/locale/th'); 

// 1. ตั้งค่า Key (เราจะดึงจาก GitHub Secrets เพื่อความปลอดภัย)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runCutoff() {
  const todayStr = dayjs().format("YYYY-MM-DD");
  const timestampStr = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const currentTime = dayjs(); // เวลาปัจจุบันของ Server (UTC)

  console.log(`Starting Cutoff check for: ${todayStr}`);

  try {
    // 2. ดึงค่า Config (รวมทั้งเวลาตัดยอด)
    let fine = 50;
    let cutoffTimeStr = "16:00"; // Default
    
    const settingDoc = await db.collection("settings").doc("checkin").get();
    if(settingDoc.exists) {
        const sData = settingDoc.data();
        fine = sData.absentFine || 50;
        cutoffTimeStr = sData.checkoutTime || "16:00"; // ดึงเวลา Check Out ที่ตั้งไว้
    }

    // 3. กำหนดเวลาตัดยอดวันนี้ (ใช้เวลาไทย)
    // NOTE: Server รันด้วย UTC แต่อ่านค่าเวลาไทยจาก Firestore เราต้องแปลงให้ถูก
    // วิธีง่ายที่สุดคือ ให้ถือว่าค่าที่อ่านมา (เช่น 16:00) คือเวลาปัจจุบันในวันนั้น
    const [ch, cm] = cutoffTimeStr.split(':').map(Number);
    
    // 🔥 เราจะใช้ dayjs เพื่อสร้าง Object สำหรับเปรียบเทียบเวลา
    // แต่ต้องระวัง Timezone ซึ่ง GitHub รันด้วย UTC ดังนั้นเราจะแค่สร้างเวลานี้ในวันปัจจุบัน
    // และใช้การเปรียบเทียบเวลา ณ วันปัจจุบัน
    
    // เนื่องจาก GitHub Action รันบน UTC เราจะใช้การเปรียบเทียบง่ายๆ โดยการกำหนดเวลาปัจจุบัน
    const cutoffTime = dayjs().hour(ch).minute(cm).second(0).millisecond(0);
    
    console.log(`Configured Cutoff Time (HH:mm): ${cutoffTimeStr}`);
    console.log(`Current Time (UTC): ${currentTime.format("HH:mm")}`);
    console.log(`Cutoff Threshold Time (UTC): ${cutoffTime.format("HH:mm")}`);

    // 4. ตรวจสอบเงื่อนไขการตัดยอด
    if (currentTime.isBefore(cutoffTime)) {
        console.log("Current time is before the configured cutoff time. Aborting.");
        return; // เวลายังไม่ถึง ให้ออกจากการทำงาน
    }

    // 5. ตรวจสอบว่าได้ตัดยอดไปแล้วหรือยัง (เพื่อป้องกันรันซ้ำ)
    const hasAutoRecord = await db.collection("employee_checkin")
        .where("date", "==", todayStr)
        .where("isAutoAbsent", "==", true)
        .limit(1)
        .get();
        
    if (!hasAutoRecord.empty) {
        console.log("Cutoff already performed for today. Aborting.");
        return;
    }
    
    // 6. ดึงข้อมูลพนักงานและรายการเข้า-ลา (Logic เดิม)
    const empSnap = await db.collection("employees").get();
    const employees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const checkinSnap = await db.collection("employee_checkin").where("date", "==", todayStr).get();
    const checkinIds = checkinSnap.docs.map(doc => doc.data().employeeId);

    const leaveSnap = await db.collection("employee_leave").where("date", "==", todayStr).get();
    const leaveIds = leaveSnap.docs.map(doc => doc.data().employeeId);

    // 7. หาคนขาด
    const absentList = employees.filter(emp => {
      return !checkinIds.includes(emp.employeeId) && !leaveIds.includes(emp.employeeId);
    });

    console.log(`Found ${absentList.length} absent employees.`);

    if (absentList.length === 0) {
      console.log("No absentees today.");
      return;
    }

    // 8. บันทึกลง Firebase (ใช้ setDoc เพื่อกันซ้ำ)
    const batch = db.batch();

    absentList.forEach(emp => {
      const customDocId = `${emp.employeeId}_${todayStr}`;
      const newRef = db.collection("employee_checkin").doc(customDocId); 
      
      batch.set(newRef, {
        employeeId: emp.employeeId,
        name: emp.name,
        department: emp.department || "",
        branch: emp.branch || (Array.isArray(emp.branches) ? emp.branches[0] : ""),
        date: todayStr,
        checkinTime: "-",
        checkoutTime: "-",
        timestamp: timestampStr,
        status: "ขาดงาน",
        fine: fine,
        isAutoAbsent: true, 
        isManual: false
      });
    });

    await batch.commit();
    console.log(`Successfully committed ${absentList.length} records to Firestore.`);

  } catch (err) {
    console.error("Cutoff failed:", err);
    throw new Error(`Cutoff Process Failed: ${err.message}`); 
  }
}

runCutoff();