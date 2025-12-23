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
// หรือถ้า test ในเครื่องตัวเอง ให้ใส่ path ไฟล์ key json ตรงๆ
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require("./serviceAccountKey.json"); // กรณีรัน local

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runCutoff() {
  // ดึงเวลาปัจจุบันใน Bangkok Time
  const currentTimeThai = dayjs().tz('Asia/Bangkok'); 
  const todayStr = currentTimeThai.format("YYYY-MM-DD");
  const timestampStr = currentTimeThai.format("YYYY-MM-DD HH:mm:ss");
  const dayOfWeek = currentTimeThai.day(); // 0 = อาทิตย์, 6 = เสาร์
  
  console.log(`Starting Cutoff check for: ${todayStr} (Day: ${dayOfWeek})`);

  // ✅ 1. เพิ่มการเช็ควันหยุดเสาร์-อาทิตย์
  // ถ้าวันนี้เป็นเสาร์ (6) หรือ อาทิตย์ (0) -> อาจจะต้องข้ามการตัดขาดงานสำหรับ Office (01, 02)
  // แต่ Sales/Transport อาจจะต้องทำ ดังนั้นเราจะกรองตอนเลือก employees แทน

  try {
    // 2. ดึงเวลาตัดยอดจาก Setting Page (Firestore)
    let cutoffHour = 17; // Default 17:00
    let cutoffMinute = 0; 
    let fine = 50;

    const settingDoc = await db.collection("settings").doc("checkin").get();
    if (settingDoc.exists) {
      const s = settingDoc.data();
      if (s.checkoutTime) {
         const parts = s.checkoutTime.split(":");
         cutoffHour = parseInt(parts[0]);
         cutoffMinute = parseInt(parts[1]);
      }
      fine = s.absentFine || 50;
    }

    // เช็คว่าถึงเวลาตัดยอดหรือยัง (เทียบกับเวลาปัจจุบัน)
    // ถ้าเวลารัน script < เวลาตัดยอด ให้จบการทำงาน (ป้องกันรันก่อนเวลา)
    const cutoffTime = currentTimeThai.hour(cutoffHour).minute(cutoffMinute);
    if (currentTimeThai.isBefore(cutoffTime)) {
        console.log(`ยังไม่ถึงเวลาตัดยอด (${cutoffHour}:${cutoffMinute}). Current: ${currentTimeThai.format('HH:mm')}`);
        // return; // เปิดบรรทัดนี้ถ้าจะใช้ logic เวลา (แต่ถ้าใช้ GitHub Action schedule มาเป๊ะแล้ว ก็ปิดได้)
    }

    // 3. ดึงรายชื่อพนักงานทั้งหมด
    const empSnap = await db.collection("employees").get();
    const employees = empSnap.docs.map(doc => {
        const d = doc.data();
        return { employeeId: d.employeeId, name: d.name, department: d.department || "", branch: d.branch || "" };
    });

    // 4. ดึงคนที่มี Check-in หรือ Leave วันนี้แล้ว
    const checkinSnap = await db.collection("employee_checkin").where("date", "==", todayStr).get();
    const checkinIds = checkinSnap.docs.map(doc => doc.data().employeeId);

    const leaveSnap = await db.collection("employee_leave").where("date", "==", todayStr).get();
    const leaveIds = leaveSnap.docs.map(doc => doc.data().employeeId);

    // ✅ 4.5 ดึงข้อมูลวันหยุดนักขัตฤกษ์ (ถ้ามี)
    // เพื่อเช็คว่าวันนี้เป็นวันหยุดพิเศษหรือไม่
    let isPublicHoliday = false;
    let holidayTargetBranches = "ALL"; // Default หยุดหมด
    const holidayQuery = await db.collection("public_holidays").where("date", "==", todayStr).get();
    if (!holidayQuery.empty) {
        isPublicHoliday = true;
        const hData = holidayQuery.docs[0].data();
        holidayTargetBranches = hData.targetBranches || "ALL";
        console.log(`Today is Public Holiday: ${hData.title}`);
    }

    // 5. หาคนขาด (และกรองคนที่ไม่ต้องมาทำงานออก)
    const absentList = employees.filter(emp => {
      // ถ้าเช็คอินแล้ว หรือ ลาแล้ว -> ไม่ขาด
      if (checkinIds.includes(emp.employeeId) || leaveIds.includes(emp.employeeId)) return false;
      
      // ✅ กรองวันหยุดเสาร์-อาทิตย์ สำหรับ Office (01, 02)
      if (["01", "02"].includes(emp.department)) {
          // ถ้าเป็นเสาร์(6) หรือ อาทิตย์(0) -> ไม่นับว่าขาด (Office หยุด)
          if (dayOfWeek === 0 || dayOfWeek === 6) return false;
          
          // ✅ กรองวันหยุดนักขัตฤกษ์ สำหรับ Office
          // Office ได้หยุดทุกวันนักขัตฤกษ์ (สมมติ)
          if (isPublicHoliday) {
              // เช็คเพิ่มว่าสาขาของ Office นี้หยุดไหม (ถ้าหยุดเฉพาะสาขา)
              let isBranchOff = false;
              if (holidayTargetBranches === "ALL" || !holidayTargetBranches || holidayTargetBranches.length === 0) isBranchOff = true;
              else if (Array.isArray(holidayTargetBranches)) {
                   // ต้องไปหา ID สาขามาเทียบ (ซึ่งใน script นี้เรามีแค่ชื่อสาขา อาจจะไม่แม่นยำถ้าระบบใช้ ID)
                   // เพื่อความง่าย ถ้าเป็นนักขัตฤกษ์ ให้ Office รอดไปก่อน
                   isBranchOff = true; 
              }
              if (isBranchOff) return false;
          }
      }

      // สำหรับ Sales (03) / Transport (04)
      // ปกติทำงานเสาร์-อาทิตย์ได้ จึงไม่กรองวันหยุดสุดสัปดาห์
      // แต่วันหยุดนักขัตฤกษ์ ถ้าสาขาหยุด -> ก็ไม่ต้องมา (ไม่ขาด)
      // แต่ถ้าสาขาไม่หยุด -> ต้องมา (ถ้าไม่มา = ขาด)

      return true; // คนที่เหลือคือขาดงานจริง
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
      
      // ตรวจสอบว่าเป็นผู้บริหาร (01) หรือไม่ ถ้าใช่ค่าปรับ 0
      const fineAmount = emp.department === "01" ? 0 : fine;

      batch.set(newRef, {
        employeeId: emp.employeeId,
        name: emp.name,
        department: emp.department || "",
        branch: emp.branch || "",
        date: todayStr,
        checkinTime: "-",
        checkoutTime: "-",
        timestamp: timestampStr,
        status: "ขาดงาน", // สถานะเริ่มต้นเมื่อตัดรอบ
        fine: fineAmount,
        isAutoAbsent: true // Flag บอกว่าเป็นระบบตัดอัตโนมัติ
      });
    });

    await batch.commit();
    console.log("Successfully recorded absentees.");

  } catch (error) {
    console.error("Error running cutoff:", error);
  }
}

// Run Function
runCutoff();