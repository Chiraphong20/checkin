import React, { useEffect, useState, useRef } from "react";
import { Select, Button, Card, Typography, message, Modal, Spin, Avatar, Tag, Row, Col } from "antd"; 
import { 
  ScanOutlined, 
  UserOutlined, 
  EnvironmentOutlined, 
  ClockCircleOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LogoutOutlined,
  FieldTimeOutlined
} from "@ant-design/icons";
import { collection, getDocs, addDoc, setDoc, updateDoc, query, where, doc, getDoc } from "firebase/firestore"; 
import { db } from "../firebase";
import dayjs from "dayjs";
import "dayjs/locale/th"; 
import { initLiff, getProfile, getLineUserId } from "../liff/liff-checkin";
import { Html5Qrcode } from "html5-qrcode";

dayjs.locale('th');

const { Option } = Select;
const { Title, Text } = Typography;

// Helper: แปลงเวลา HH:mm เป็นนาที
const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hour, minute] = timeStr.split(':').map(Number);
  if (isNaN(hour) || isNaN(minute)) return 0;
  return (hour * 60) + minute;
};

export default function EmployeeCheckIn() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [lineProfile, setLineProfile] = useState(null);
  const [firstTime, setFirstTime] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [todayCheckin, setTodayCheckin] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Modals state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastCheckInMessage, setLastCheckInMessage] = useState("");
  const [showLateLevel1Modal, setShowLateLevel1Modal] = useState(false);
  const [showLateLevel2Modal, setShowLateLevel2Modal] = useState(false);
  const [showLateLevel3Modal, setShowLateLevel3Modal] = useState(false);
  const [showOutsideModal, setShowOutsideModal] = useState(false);
  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const [firstTimeCheckInMessage, setFirstTimeCheckInMessage] = useState("");
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");

  const qrRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const hasScannedRef = useRef(false);
  
  // 🔥 New: เก็บข้อมูลสาขาแบบละเอียด (เพื่อดึงเวลาของแต่ละสาขา)
  const [branchDataMap, setBranchDataMap] = useState({});
  const [globalSettings, setGlobalSettings] = useState(null);

  const [currentTime, setCurrentTime] = useState(dayjs());

  const normalizeBranch = (s) => (s || "").toString().trim();
  const toRad = (deg) => (deg * Math.PI) / 180;
  
  const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const getCurrentPosition = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("ไม่รองรับการระบุตำแหน่ง"));
      navigator.geolocation.getCurrentPosition(
        resolve, reject, 
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
      );
    });

  const checkTodayCheckin = async (employeeId) => {
    if (!employeeId) return;
    const today = dayjs().format("YYYY-MM-DD");
    
    // เช็คการลา
    const leaveQuery = query(collection(db, "employee_leave"), where("employeeId", "==", employeeId), where("date", "==", today));
    const leaveSnap = await getDocs(leaveQuery);
    const hasLeaveToday = !leaveSnap.empty;

    // เช็คการลงเวลา
    const checkinQuery = query(collection(db, "employee_checkin"), where("employeeId", "==", employeeId), where("date", "==", today));
    const checkinSnap = await getDocs(checkinQuery);

    if (!checkinSnap.empty) {
      const checkinData = checkinSnap.docs[0].data();
      setTodayCheckin({ id: checkinSnap.docs[0].id, ...checkinData });
    } else {
      setTodayCheckin(null);
      if (!hasLeaveToday) {
        setLastCheckInMessage(`❌ ยังไม่ได้เช็คอินวันนี้`);
      }
    }
  };

  // 1. Main Load Data
  useEffect(() => {
    const startLiff = async () => {
      try {
        // A. โหลด Global Settings (ค่าปรับ, รัศมี)
        const settingsRef = doc(db, "settings", "checkin");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
            setGlobalSettings(settingsSnap.data());
        }

        // B. โหลดข้อมูลสาขา (เวลาเข้างาน, พิกัด) เก็บลง Map
        const branchSnap = await getDocs(collection(db, "branches"));
        const bMap = {};
        branchSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.name) {
                // แปลงเวลาเก็บเป็นนาทีไว้เลย เพื่อความเร็วในการคำนวณ
                bMap[normalizeBranch(data.name)] = {
                    ...data,
                    // Parse Shift 1 Times
                    shift1_start: timeToMinutes(data.shift1_startTime || "08:00"),
                    shift1_late: timeToMinutes(data.shift1_lateAfter || "08:05"),
                    shift1_t1: timeToMinutes(data.shift1_lateThreshold1 || "08:15"),
                    shift1_t2: timeToMinutes(data.shift1_lateThreshold2 || "08:30"),
                    shift1_out: timeToMinutes(data.shift1_checkoutTime || "16:00"),
                    
                    // Parse Shift 2 Times
                    shift2_start: timeToMinutes(data.shift2_startTime || "13:00"),
                    shift2_late: timeToMinutes(data.shift2_lateAfter || "13:05"),
                    shift2_t1: timeToMinutes(data.shift2_lateThreshold1 || "13:15"),
                    shift2_t2: timeToMinutes(data.shift2_lateThreshold2 || "13:30"),
                    shift2_out: timeToMinutes(data.shift2_checkoutTime || "21:00"),
                    
                    // Coords
                    lat: data.gps ? parseFloat(data.gps.split(',')[0]) : (data.lat || 0),
                    lng: data.gps ? parseFloat(data.gps.split(',')[1]) : (data.lng || 0),
                };
            }
        });
        setBranchDataMap(bMap);

      } catch (e) { console.error("Load Settings Error", e); }
      
      // C. Liff & Employee Logic (เหมือนเดิม)
      await initLiff("YOUR_LIFF_ID"); // ใส่ LIFF ID เดิม
      const profile = await getProfile();
      const userId = getLineUserId();
      if (profile && userId) setLineProfile({ ...profile, userId });

      const q = query(collection(db, "employees"), where("lineUserId", "==", userId));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const emp = snapshot.docs[0].data();
        const employeeId = snapshot.docs[0].id;
        setSelectedEmployee({ employeeId, ...emp });
        setFirstTime(false);
        await checkTodayCheckin(employeeId); 
      } else {
        const empSnapshot = await getDocs(collection(db, "employees"));
        setEmployees(empSnapshot.docs.map(doc => ({ employeeId: doc.id, ...doc.data() })));
        setFirstTime(true);
      }

      setDataLoaded(true);
    };

    startLiff();
    return () => {
        if(html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop().catch(err => {});
        }
    };
  }, []);

  useEffect(() => {
    const timeInterval = setInterval(() => setCurrentTime(dayjs()), 1000); 
    return () => clearInterval(timeInterval);
  }, []);

  // --- Logic ใหม่: คำนวณสถานะตามกะ ---
  const calculateShiftAndStatus = (currentMinutes, branchConfig) => {
      // 1. ระบุกะ: ถ้ามีกะ 2 ให้ดูว่าเวลาปัจจุบันใกล้ Start Time กะไหนมากกว่ากัน
      let currentShift = 1;
      
      if (branchConfig.hasShift2) {
          const diff1 = Math.abs(currentMinutes - branchConfig.shift1_start);
          const diff2 = Math.abs(currentMinutes - branchConfig.shift2_start);
          // ถ้าใกล้กะ 2 มากกว่า หรือเลยเวลากะ 1 มาไกลมากแล้ว
          if (diff2 < diff1) currentShift = 2;
      }

      // 2. ดึงเกณฑ์เวลาของกะที่เลือก
      const start = currentShift === 1 ? branchConfig.shift1_start : branchConfig.shift2_start;
      const lateAfter = currentShift === 1 ? branchConfig.shift1_late : branchConfig.shift2_late;
      const t1 = currentShift === 1 ? branchConfig.shift1_t1 : branchConfig.shift2_t1;
      const t2 = currentShift === 1 ? branchConfig.shift1_t2 : branchConfig.shift2_t2;

      // 3. ดึงค่าปรับ Global
      const { lateFine20, lateFine50, absentFine } = globalSettings || { lateFine20: 20, lateFine50: 50, absentFine: 50 };

      // 4. คำนวณสถานะ
      let status = "มาปกติ";
      let fine = 0;

      if (currentMinutes <= lateAfter) { status = "มาปกติ"; fine = 0; }
      else if (currentMinutes <= t1) { status = "มาสาย (ระดับ 1)"; fine = lateFine20; }
      else if (currentMinutes <= t2) { status = "มาสาย (ระดับ 2)"; fine = lateFine50; }
      else { status = "ขาดงาน/สายมาก"; fine = absentFine; }

      return { shift: currentShift, status, fine };
  };

  const handleCheckIn = async (branchName, options = {}) => {
    if (!selectedEmployee) return;
    
    // 1. ดึงข้อมูลสาขาที่สแกนเจอ
    const branchConfig = branchDataMap[normalizeBranch(branchName)];
    
    // ถ้าไม่มีข้อมูลสาขา ใช้ Default (หรือแจ้งเตือน)
    if (!branchConfig) {
        message.error("ไม่พบข้อมูลการตั้งค่าเวลาของสาขานี้");
        return;
    }

    const now = dayjs();
    const currentMinutes = now.hour() * 60 + now.minute();
    const formattedTimestamp = now.format("YYYY-MM-DD HH:mm:ss");
    const date = now.format("YYYY-MM-DD");
    const time = now.format("HH:mm");

    // 2. คำนวณกะ และสถานะ (Logic ใหม่)
    let { shift, status, fine } = calculateShiftAndStatus(currentMinutes, branchConfig);

    // Override ถ้านอกพื้นที่
    if (options.outsideArea) { 
        status = "นอกพื้นที่"; 
        fine = 0; 
        setLastCheckInMessage(`❌ อยู่นอกพื้นที่\n${options.debugMessage || "ตรวจสอบ GPS"}`);
    }

    try {
      // (First Time logic omitted for brevity - same as before)
      if (firstTime) { /* ... Logic update user ... */ setFirstTime(false); }

      // 3. บันทึกข้อมูล (เพิ่ม field: shift)
      await addDoc(collection(db, "employee_checkin"), {
        employeeId: selectedEmployee.employeeId,
        name: selectedEmployee.name,
        branch: branchName,
        shift: shift, // ✅ บันทึกว่าเข้ากะไหน
        lineUserId: lineProfile.userId,
        date, checkinTime: time, checkoutTime: "-", timestamp: formattedTimestamp, status, fine,
      });
      
      let messageForModal = `✅ เช็คอินสำเร็จ (กะ ${shift})!\nชื่อ: ${selectedEmployee.name}\nสาขา: ${branchName}\nเวลา: ${time}\nสถานะ: ${status}`;
      
      if (!options.outsideArea) setLastCheckInMessage(messageForModal);
      
      await checkTodayCheckin(selectedEmployee.employeeId);

      // 4. แสดง Modal ตามผลลัพธ์
      if (options.outsideArea) {
           setTimeout(() => setShowOutsideModal(true), 60);
      } else {
           // คำนวณ Threshold ของกะปัจจุบันเพื่อเลือก Modal
           const t1 = shift === 1 ? branchConfig.shift1_t1 : branchConfig.shift2_t1;
           const t2 = shift === 1 ? branchConfig.shift1_t2 : branchConfig.shift2_t2;
           const lateAfter = shift === 1 ? branchConfig.shift1_late : branchConfig.shift2_late;

           if (currentMinutes > lateAfter && currentMinutes <= t1) setTimeout(() => setShowLateLevel1Modal(true), 60);
           else if (currentMinutes > t1 && currentMinutes <= t2) setTimeout(() => setShowLateLevel2Modal(true), 60);
           else if (currentMinutes > t2) setTimeout(() => setShowLateLevel3Modal(true), 60);
           else setTimeout(() => setShowSuccessModal(true), 60);
      }

    } catch (error) {
      console.error(error);
      message.error("บันทึกไม่สำเร็จ");
    }
  };

  const handleCheckOut = async () => {
    if (!todayCheckin) return;
    const now = dayjs();
    
    // ตรวจสอบเวลาก่อนเช็คเอาท์ (ตามกะที่เช็คอินเข้ามา)
    const currentMinutes = now.hour() * 60 + now.minute();
    const branchConfig = branchDataMap[normalizeBranch(todayCheckin.branch)];
    
    if (branchConfig) {
        // ดึงเวลาเช็คเอาท์ขั้นต่ำตามกะที่ลงไว้
        const minCheckout = todayCheckin.shift === 2 ? branchConfig.shift2_out : branchConfig.shift1_out;
        
        if (currentMinutes < minCheckout) {
             const minTimeStr = `${Math.floor(minCheckout/60).toString().padStart(2,'0')}:${(minCheckout%60).toString().padStart(2,'0')}`;
             message.warning(`ยังไม่ถึงเวลาเช็คเอาท์ (${minTimeStr} น.)`);
             return; // ❌ ห้ามเช็คเอาท์ก่อนเวลา
        }
    }

    try {
      const checkoutTime = now.format("HH:mm");
      const checkoutTimestamp = now.format("YYYY-MM-DD HH:mm:ss");
      const checkinRef = doc(db, "employee_checkin", todayCheckin.id);
      await updateDoc(checkinRef, { checkoutTime, checkoutTimestamp });
      
      setCheckoutMessage(`✅ เช็คเอาท์สำเร็จ!\nเวลา: ${checkoutTime}`);
      setTimeout(() => setShowCheckoutModal(true), 60);
      await checkTodayCheckin(selectedEmployee.employeeId);
    } catch (error) {
      message.error("บันทึกเช็คเอาท์ไม่สำเร็จ");
    }
  };

  // --- Scanner Logic (Modified) ---
  const startQRScan = async () => {
    if (!qrRef.current || !selectedEmployee || scanning || !html5QrCodeRef.current) return;
    setScanning(true);
    hasScannedRef.current = false;

    try {
      await html5QrCodeRef.current.start(
        { facingMode: "environment" }, { fps: 10, qrbox: 250 },
        async (decodedText) => {
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;
          await html5QrCodeRef.current.stop();
          setScanning(false);

          // Parse QR
          let branchName = "";
          try {
            const url = new URL(decodedText);
            branchName = decodeURIComponent(url.searchParams.get("branch") || "").trim();
          } catch (e) {
             message.error("QR Code ไม่ถูกต้อง"); return;
          }

          // Check GPS
          let outsideArea = false;
          let debugMsg = "";
          const branchConfig = branchDataMap[normalizeBranch(branchName)];

          if (branchConfig && branchConfig.lat && branchConfig.lng) {
             try {
                 const pos = await getCurrentPosition();
                 const { latitude, longitude, accuracy } = pos.coords;
                 const dist = haversineMeters(latitude, longitude, branchConfig.lat, branchConfig.lng);
                 const adjustedDist = Math.max(0, dist - accuracy);
                 const radius = globalSettings?.radius || 100;

                 if (adjustedDist > radius) {
                     outsideArea = true;
                     debugMsg = `ห่าง ${dist.toFixed(0)} ม. (รัศมี ${radius})`;
                 }
             } catch(e) { outsideArea = true; debugMsg = "GPS Error"; }
          } else {
             // ถ้าสาขาไม่มีพิกัด หรือหาไม่เจอ อาจจะยอมให้ผ่าน หรือบังคับ Outside
             // outsideArea = true; debugMsg = "ไม่พบพิกัดสาขา";
          }

          const isCheckedIn = !!(todayCheckin && todayCheckin.checkinTime && todayCheckin.checkinTime !== "-");
          const isCheckedOut = !!(todayCheckin && todayCheckin.checkoutTime && todayCheckin.checkoutTime !== "-");

          if (isCheckedIn && !isCheckedOut) {
              await handleCheckOut(); // ระบบจะเช็คเวลาขั้นต่ำใน function
          } else if (!isCheckedIn) {
              await handleCheckIn(branchName, { outsideArea, debugMessage: debugMsg });
          } else {
              message.info("วันนี้จบงานแล้ว");
          }
        },
        () => {}
      );
    } catch (e) { setScanning(false); }
  };

  // --- Auto Start & UI Render (ส่วนที่เหลือเหมือนเดิม แต่ปรับ Text นิดหน่อย) ---
  const handleSelect = (value) => setSelectedEmployee(employees.find(e => e.employeeId === value));

  if (!dataLoaded) return <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div>;

  const isCheckedIn = !!(todayCheckin?.checkinTime && todayCheckin.checkinTime !== "-");
  const isCheckedOut = !!(todayCheckin?.checkoutTime && todayCheckin.checkoutTime !== "-");

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fa", fontFamily: "'Sarabun', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #FF6539 0%, #ff8e6f 100%)", padding: "30px 20px 80px 20px", borderBottomLeftRadius: 30, borderBottomRightRadius: 30, color: "white", boxShadow: "0 4px 15px rgba(255, 101, 57, 0.3)" }}>
        <Row justify="space-between" align="middle">
            <Col>
                <Title level={3} style={{ color: "white", margin: 0 }}>สวัสดี, {lineProfile?.displayName.split(" ")[0]}</Title>
            </Col>
            <Col style={{ textAlign: "right" }}>
                <Title level={2} style={{ color: "white", margin: 0 }}>{currentTime.format("HH:mm")}</Title>
            </Col>
        </Row>
      </div>

      {/* Content */}
      <div style={{ padding: "0 20px", marginTop: -60 }}>
        {/* Profile Card */}
        <Card bordered={false} style={{ borderRadius: 20, marginBottom: 20, boxShadow: "0 8px 20px rgba(0,0,0,0.08)" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <Avatar size={64} src={lineProfile?.pictureUrl} icon={<UserOutlined />} style={{ border: "3px solid #FF6539" }} />
                <div style={{ flex: 1 }}>
                    {firstTime ? (
                        <Select showSearch placeholder="เลือกชื่อของคุณ" onChange={handleSelect} style={{ width: '100%' }} size="large">
                            {employees.map(e => <Option key={e.employeeId} value={e.employeeId}>{e.name}</Option>)}
                        </Select>
                    ) : (
                        <>
                            <Title level={5} style={{ margin: 0 }}>{selectedEmployee?.name}</Title>
                            <Tag color="orange">{selectedEmployee?.branch || "ไม่ระบุ"}</Tag>
                            {/* แสดงกะที่กำลังทำงาน (ถ้าเช็คอินแล้ว) */}
                            {isCheckedIn && <Tag color="blue">กะ {todayCheckin.shift}</Tag>}
                        </>
                    )}
                </div>
            </div>
        </Card>

        {/* Scan Button */}
        <div style={{ marginBottom: 30 }}>
            <div id="qr-reader" ref={qrRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', display: scanning ? 'block' : 'none', marginBottom: 20 }} />
            <Button 
                type="primary" block size="large" 
                disabled={(firstTime && !selectedEmployee) || isCheckedOut}
                onClick={startQRScan} loading={scanning}
                icon={!scanning && <ScanOutlined style={{ fontSize: 24 }} />}
                style={{ height: 60, borderRadius: 15, fontSize: 18, background: isCheckedOut ? "#d9d9d9" : "linear-gradient(90deg, #FF6539 0%, #ff8e6f 100%)", border: 'none' }}
            >
                {isCheckedIn ? "สแกนเช็คเอาท์" : (isCheckedOut ? "จบงานวันนี้แล้ว" : "สแกนเช็คอิน")}
            </Button>
        </div>

        {/* Status Timeline */}
        {!firstTime && (
            <Card title="สถานะวันนี้" bordered={false} style={{ borderRadius: 20 }}>
                <Row gutter={16}>
                    <Col span={12}>
                        <Card size="small" style={{ background: isCheckedIn ? "#f6ffed" : "#f5f5f5", borderColor: isCheckedIn ? "#b7eb8f" : "#f0f0f0", textAlign: 'center' }}>
                            <Text type="secondary">เข้างาน</Text>
                            <div style={{ fontSize: 18, fontWeight: 'bold', color: isCheckedIn ? '#389e0d' : '#ccc' }}>
                                {todayCheckin?.checkinTime || "--:--"}
                            </div>
                            {isCheckedIn && <Tag color={todayCheckin.status.includes('ปกติ')?'success':'warning'}>{todayCheckin.status}</Tag>}
                        </Card>
                    </Col>
                    <Col span={12}>
                        <Card size="small" style={{ background: isCheckedOut ? "#e6f7ff" : "#f5f5f5", borderColor: isCheckedOut ? "#91d5ff" : "#f0f0f0", textAlign: 'center' }}>
                            <Text type="secondary">ออกงาน</Text>
                            <div style={{ fontSize: 18, fontWeight: 'bold', color: isCheckedOut ? '#096dd9' : '#ccc' }}>
                                {todayCheckin?.checkoutTime !== "-" ? todayCheckin?.checkoutTime : "--:--"}
                            </div>
                        </Card>
                    </Col>
                </Row>
            </Card>
        )}
      </div>

      {/* --- Modals Zone (เหมือนเดิม เพิ่มแค่ Modal 3 ระดับที่คุยกันไว้) --- */}
      <Modal open={showSuccessModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <CheckCircleFilled style={{ fontSize: 60, color: '#52c41a', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#52c41a' }}>สุดยอด! มาทันเวลา</Title>
         <img src="/ontime.gif" alt="On time" style={{ width: 200, marginBottom: 20 }} />
         <div style={{ background: '#f6ffed', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{lastCheckInMessage}</pre></div>
         <Button type="primary" block size="large" onClick={()=>setShowSuccessModal(false)}>ตกลง</Button>
      </Modal>

      <Modal open={showLateLevel1Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <ClockCircleOutlined style={{ fontSize: 60, color: '#faad14', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#faad14' }}>มาให้ไวกว่านี้นะ</Title>
         <div style={{ background: '#fffbe6', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{lastCheckInMessage}</pre></div>
         <Button type="primary" style={{ background: '#faad14', borderColor: '#faad14' }} block size="large" onClick={()=>setShowLateLevel1Modal(false)}>รับทราบ</Button>
      </Modal>

      <Modal open={showLateLevel2Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <div style={{ fontSize: 60, marginBottom: 20 }}>🏃💨</div>
         <Title level={3} style={{ color: '#fa541c' }}>วิ่งงงงงงงง</Title>
         <div style={{ background: '#fff2e8', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{lastCheckInMessage}</pre></div>
         <Button type="primary" danger block size="large" onClick={()=>setShowLateLevel2Modal(false)}>รับทราบ</Button>
      </Modal>

      <Modal open={showLateLevel3Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 0 }}>
         <CloseCircleFilled style={{ fontSize: 60, color: '#cf1322', marginBottom: 20, marginTop: 30 }} />
         <Title level={4} style={{ color: '#cf1322' }}>สายแล้วนะ! กลับบ้านไปนอนเลยนะ</Title>
         <img src="/sleep.jpg" alt="Go to sleep" style={{ width: '100%', maxWidth: 300, borderRadius: 8 }} />
         <div style={{ background: '#fff1f0', padding: 15, borderRadius: 10, margin: '20px' }}><pre>{lastCheckInMessage}</pre></div>
         <div style={{ padding: '0 20px 30px' }}><Button type="primary" danger block size="large" onClick={()=>setShowLateLevel3Modal(false)}>รับทราบ</Button></div>
      </Modal>

      <Modal open={showCheckoutModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <LogoutOutlined style={{ fontSize: 60, color: '#1890ff', marginBottom: 20 }} />
         <Title level={4}>เช็คเอาท์สำเร็จ</Title>
         <div style={{ background: '#e6f7ff', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{checkoutMessage}</pre></div>
         <Button type="primary" block size="large" onClick={()=>setShowCheckoutModal(false)}>ตกลง</Button>
      </Modal>

      <Modal open={showOutsideModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <EnvironmentOutlined style={{ fontSize: 60, color: '#faad14', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#faad14' }}>อยู่นอกพื้นที่!</Title>
         <div style={{ background: '#fffbe6', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{lastCheckInMessage}</pre></div>
         <Button type="primary" danger block size="large" onClick={()=>setShowOutsideModal(false)}>รับทราบ</Button>
      </Modal>

      <Modal open={showFirstTimeModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <CheckCircleFilled style={{ fontSize: 60, color: '#52c41a', marginBottom: 20 }} />
         <Title level={4}>ยินดีต้อนรับ</Title>
         <div style={{ background: '#f6ffed', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{firstTimeCheckInMessage}</pre></div>
         <Button type="primary" block size="large" onClick={()=>setShowFirstTimeModal(false)}>เริ่มใช้งาน</Button>
      </Modal>

    </div>
  );
}