// ⚠️ ไฟล์นี้สำหรับรันบน Server/GitHub Actions เท่านั้น ห้ามใช้ในหน้าเว็บ React
const admin = require("firebase-admin");
const dayjs = require("dayjs");
require('dayjs/locale/th'); // ถ้าต้องการภาษาไทย

// 1. ตั้งค่า Key (เราจะดึงจาก GitHub Secrets เพื่อความปลอดภัย)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runCutoff() {
  const todayStr = dayjs().format("YYYY-MM-DD");
  const timestampStr = dayjs().format("YYYY-MM-DD HH:mm:ss");
  console.log(`Starting Cutoff for: ${todayStr}`);

  try {
    // 2. ดึงข้อมูลทั้งหมด (เหมือนในหน้า Dashboard แต่ใช้ Admin SDK)
    const empSnap = await db.collection("employees").get();
    const employees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const checkinSnap = await db.collection("employee_checkin").where("date", "==", todayStr).get();
    const checkinIds = checkinSnap.docs.map(doc => doc.data().employeeId);

    const leaveSnap = await db.collection("employee_leave").where("date", "==", todayStr).get();
    const leaveIds = leaveSnap.docs.map(doc => doc.data().employeeId);

    // 3. หาคนขาด
    const absentList = employees.filter(emp => {
      return !checkinIds.includes(emp.employeeId) && !leaveIds.includes(emp.employeeId);
    });

    console.log(`Found ${absentList.length} absent employees.`);

    if (absentList.length === 0) {
      console.log("No absentees today.");
      return;
    }

    // 4. บันทึกลง Firebase (Batch Write เพื่อความเร็ว)
    const batch = db.batch();
    
    // ดึงค่าปรับจาก settings (ถ้ามี)
    let fine = 50;
    const settingDoc = await db.collection("settings").doc("checkin").get();
    if(settingDoc.exists) fine = settingDoc.data().absentFine || 50;

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
    console.log("✅ Successfully recorded absentees.");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1); // แจ้ง GitHub ว่า Error
  }
}

runCutoff();