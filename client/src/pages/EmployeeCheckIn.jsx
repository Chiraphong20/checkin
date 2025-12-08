import React, { useEffect, useState, useRef, useCallback } from "react";
import { Select, Button, Card, Typography, message, Modal, Spin, Avatar, Tag, Row, Col, Divider, Alert } from "antd"; 
import { 
  ScanOutlined, 
  UserOutlined, 
  EnvironmentOutlined, 
  ClockCircleOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LogoutOutlined,
  FieldTimeOutlined // เพิ่ม Icon ใหม่
} from "@ant-design/icons";
import { collection, getDocs, addDoc, setDoc, updateDoc, query, where, doc, getDoc } from "firebase/firestore"; 
import { db } from "../firebase";
import dayjs from "dayjs";
import "dayjs/locale/th"; 
import { initLiff, getProfile, getLineUserId } from "../liff/liff-checkin";
import { Html5Qrcode } from "html5-qrcode";

// ตั้งค่าภาษาไทยให้ dayjs
dayjs.locale('th');

const { Option } = Select;
const { Title, Text } = Typography;

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
  
  // ✅ เปลี่ยนชื่อเป็น 'scanning' เพื่อให้เข้ากับ Logic การแก้ไข
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

  const qrRef = useRef(null); // ไม่ได้ใช้แล้วแต่เก็บไว้
  const html5QrCodeRef = useRef(null);
  const hasScannedRef = useRef(false);
  
  // 🔥 New: เก็บข้อมูลสาขาแบบละเอียด (เพื่อดึงเวลาของแต่ละสาขา)
  const [branchDataMap, setBranchDataMap] = useState({});
  const [globalSettings, setGlobalSettings] = useState(null); // เก็บค่าปรับ Global

  const [currentTime, setCurrentTime] = useState(dayjs());
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = dayjs();
    return now.hour() * 60 + now.minute();
  });

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
        resolve, 
        reject, 
        { 
            enableHighAccuracy: true, 
            timeout: 20000, 
            maximumAge: 60000 
        }
      );
    });

  const checkTodayCheckin = async (employeeId) => {
    if (!employeeId) return;
    const today = dayjs().format("YYYY-MM-DD");

    const leaveQuery = query(collection(db, "employee_leave"), where("employeeId", "==", employeeId), where("date", "==", today));
    const leaveSnap = await getDocs(leaveQuery);
    const hasLeaveToday = !leaveSnap.empty;

    const checkinQuery = query(collection(db, "employee_checkin"), where("employeeId", "==", employeeId), where("date", "==", today));
    const checkinSnap = await getDocs(checkinQuery);

    if (!checkinSnap.empty) {
      const checkinData = checkinSnap.docs[0].data();
      setTodayCheckin({ id: checkinSnap.docs[0].id, ...checkinData });
    } else {
      setTodayCheckin(null);
      if (!hasLeaveToday && globalSettings) {
        // setLastCheckInMessage(`❌ พนักงานไม่ได้เช็คอินวันนี้ (${today})`);
      }
    }
  };

  // 1. Main Load Data (Same as original)
  useEffect(() => {
    const startLiff = async () => {
      try {
        // A. โหลด Global Settings (ค่าปรับ, รัศมี)
        const settingsRef = doc(db, "settings", "checkin");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            setGlobalSettings({
                ...data,
                radius: data.radius || 100,
                allowOutside: data.allowOutside || false,
                lateFine20: data.lateFine20 || 20,
                lateFine50: data.lateFine50 || 50,
                absentFine: data.absentFine || 50,
            });
        } else {
            // Default Fallback
            setGlobalSettings({ radius: 100, lateFine20: 20, lateFine50: 50, absentFine: 50 });
        }

        // B. โหลดข้อมูลสาขา (เวลาเข้างานแต่ละกะ, พิกัด) เก็บลง Map
        const branchSnap = await getDocs(collection(db, "branches"));
        const bMap = {};
        branchSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.name) {
                bMap[normalizeBranch(data.name)] = {
                    ...data,
                    // Parse Shift 1 Times (ถ้าไม่มี shift1 ให้ใช้ค่าเก่า startTime เป็น fallback)
                    shift1_start: timeToMinutes(data.shift1_startTime || data.startTime || "08:00"),
                    shift1_late: timeToMinutes(data.shift1_lateAfter || data.lateAfter || "08:05"),
                    shift1_t1: timeToMinutes(data.shift1_lateThreshold1 || data.lateThreshold1 || "08:15"),
                    shift1_t2: timeToMinutes(data.shift1_lateThreshold2 || data.lateThreshold2 || "08:30"),
                    shift1_out: timeToMinutes(data.shift1_checkoutTime || data.checkoutTime || "16:00"),
                    
                    // Parse Shift 2 Times (Default ถ้าไม่มีค่า)
                    hasShift2: data.hasShift2 || false,
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
      
      // C. Liff & Employee Logic
      await initLiff("2008408737-4x2nLQp8"); // ใส่ LIFF ID เดิม
      const profile = await getProfile();
      const userId = getLineUserId();
      if (!profile || !userId) {
          message.error("ไม่สามารถดึง LINE Profile ได้");
          return;
      }
      setLineProfile({ ...profile, userId });

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
    // Cleanup เดิมที่จัดการกล้องจะถูกย้ายไปที่ useEffect ใหม่
    return () => {};
  }, []);

  // 2. Update Timer (Same as original)
  useEffect(() => {
    const timeInterval = setInterval(() => {
      const now = dayjs();
      setCurrentTime(now);
      setCurrentTimeMinutes(now.hour() * 60 + now.minute());
    }, 1000); 
    return () => clearInterval(timeInterval);
  }, []);

  // 3. Sync Data (Same as original)
  useEffect(() => {
    const dataInterval = setInterval(() => {
      if (selectedEmployee && !firstTime && globalSettings) {
        checkTodayCheckin(selectedEmployee.employeeId);
      }
    }, 60000); 
    return () => clearInterval(dataInterval);
  }, [selectedEmployee, firstTime, globalSettings]); 

  // -------------------------------------------------------------------------
  // 📷 ส่วนจัดการกล้อง (แก้ไข Race Condition ด้วย setTimeout 300ms)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let html5QrCode;

    // ถ้ากดเปิดสแกน (scanning: true)
    if (scanning) {
      // ✅ เพิ่ม setTimeout รอให้ Modal แสดงผลเสร็จก่อน 300ms
      const timer = setTimeout(() => {
        const readerId = "reader";
        
        // ต้องแน่ใจว่า Element ถูก Render แล้ว
        if (!document.getElementById(readerId)) {
            console.error("Element 'reader' not found");
            setScanning(false);
            return;
        }

        html5QrCode = new Html5Qrcode(readerId);
        html5QrCodeRef.current = html5QrCode; // เก็บ reference ไว้ใช้ใน cleanup

        const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0 
        };

        html5QrCode.start(
          { facingMode: "environment" }, // ใช้กล้องหลัง
          config,
          (decodedText) => {
            // เมื่อสแกนเจอ
            if (hasScannedRef.current) return;
            hasScannedRef.current = true; // ป้องกันการสแกนซ้ำ

            // เรียกใช้ Logic การบันทึก
            handleScanSuccess(decodedText); 
            
            // ปิดกล้องทันทีที่เจอ
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
            }).catch(err => console.error(err));
            
            setScanning(false);
          },
          (errorMessage) => {
            // console.log(errorMessage); // ปิด log error รกๆ
          }
        ).catch((err) => {
          console.error("Error starting scanner:", err);
          message.error("ไม่สามารถเริ่มกล้องได้ กรุณาอนุญาตการใช้กล้อง");
          setScanning(false);
        });
      }, 300); // <-- รอ 0.3 วินาที

      // Cleanup ของ Timer
      return () => clearTimeout(timer);
    }
    
    // Cleanup Function เมื่อปิด Modal หรือ Component ถูกทำลาย
    return () => {
      // ใช้ html5QrCodeRef.current ที่เก็บไว้ใน start()
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().then(() => {
            html5QrCodeRef.current.clear();
        }).catch((err) => console.error("Error stopping scanner:", err));
        html5QrCodeRef.current = null;
      }
    };
  }, [scanning, selectedEmployee, branchDataMap, globalSettings, lineProfile]); 
  // -------------------------------------------------------------------------

  // --- 🔥 Logic ใหม่: คำนวณกะและสถานะ (ใช้ Placeholder เพื่อความสมบูรณ์) ---
  const calculateShiftAndStatus = (currentMinutes, branchConfig) => {
      // **(ใส่ Logic คำนวณกะและสถานะของคุณที่นี่)**
      // Placeholder logic
      const now = dayjs();
      const time = now.format("HH:mm");
      let status = "มาปกติ";
      if (currentMinutes > branchConfig.shift1_t2) status = "มาสาย (ระดับ 3)";
      else if (currentMinutes > branchConfig.shift1_t1) status = "มาสาย (ระดับ 2)";
      else if (currentMinutes > branchConfig.shift1_late) status = "มาสาย (ระดับ 1)";

      return {
          shift: "เช้า", // หรือ 'บ่าย' ตาม logic เดิม
          status: status, 
          fine: 0, 
          lateAfter: branchConfig.shift1_late, 
          t1: branchConfig.shift1_t1, 
          t2: branchConfig.shift1_t2
      }; 
  };
  
  // --- 🔥 Logic Check-in / Check-out (ใช้ Placeholder เพื่อความสมบูรณ์) ---

  // 4. Function handleScanSuccess
  const handleScanSuccess = useCallback(async (decodedText) => {
    // 1. ดึงชื่อสาขาจาก QR Code
    let branchName = "";
    try {
        const url = new URL(decodedText);
        branchName = decodeURIComponent(url.searchParams.get("branch") || "");
    } catch (e) {
        message.error("QR Code ไม่ถูกต้อง");
        return;
    }

    if (!branchName) {
        message.error("ไม่พบชื่อสาขาใน QR Code");
        return;
    }

    // 2. ดึง config ของสาขา
    const branchConfig = branchDataMap[normalizeBranch(branchName)];
    if (!branchConfig) {
        message.error(`ไม่พบข้อมูลสาขา: ${branchName}`);
        return;
    }

    // 3. ดึง GPS ปัจจุบันและเช็คระยะ
    let position = null;
    let distance = -1;
    let outsideArea = false;
    let debugMessage = "";

    try {
        position = await getCurrentPosition();
        const { latitude, longitude } = position.coords;
        distance = haversineMeters(latitude, longitude, branchConfig.lat, branchConfig.lng);
        
        if (distance > globalSettings.radius) {
            outsideArea = true;
            debugMessage = `ระยะห่าง: ${distance.toFixed(2)} เมตร (เกิน ${globalSettings.radius} เมตร)`;
            if (!globalSettings.allowOutside) {
                // แสดง Modal นอกพื้นที่
                setLastCheckInMessage(`❌ อยู่ห่างจากสาขาเกิน ${globalSettings.radius} เมตร\nระยะห่างจริง: ${distance.toFixed(2)} เมตร`);
                setShowOutsideModal(true);
                return;
            }
        }
    } catch (e) {
        message.warning("ไม่สามารถระบุตำแหน่งได้ อาจเกิดข้อผิดพลาด");
        debugMessage = `GPS Error: ${e.message}`;
    }

    // 4. เตรียมข้อมูลลงเวลา
    const now = dayjs();
    const currentMinutes = now.hour() * 60 + now.minute();
    const formattedTimestamp = now.format("YYYY-MM-DD HH:mm:ss");
    const date = now.format("YYYY-MM-DD");
    const time = now.format("HH:mm");

    // 5. คำนวณกะ สถานะ และค่าปรับ
    let { shift, status, fine, lateAfter, t1, t2 } = calculateShiftAndStatus(currentMinutes, branchConfig);

    // Override ถ้านอกพื้นที่แต่ได้รับอนุญาตให้เช็คอิน (OutsideAllowed)
    if (outsideArea && globalSettings.allowOutside) {
        status = `นอกพื้นที่ (${status})`;
        fine = 0; // ไม่ปรับถ้านอกพื้นที่แต่ Admin อนุญาต
    }

    const isCheckedIn = todayCheckin && todayCheckin.checkinTime;
    const isCheckedOut = todayCheckin && todayCheckin.checkoutTime && todayCheckin.checkoutTime !== "-";
    
    try {
        // --- 🔴 กรณี CHECK-IN ---
        if (!isCheckedIn) {
            const checkinData = {
                employeeId: selectedEmployee.employeeId,
                name: selectedEmployee.name,
                branch: branchName,
                date: date,
                checkinTime: time,
                checkinTimestamp: formattedTimestamp,
                status: status,
                fine: fine,
                shift: shift,
                lat: position ? position.coords.latitude.toFixed(6) : "N/A",
                lng: position ? position.coords.longitude.toFixed(6) : "N/A",
                distance: distance > 0 ? distance.toFixed(2) : "N/A",
                checkoutTime: "-",
                checkoutTimestamp: "-",
                note: "",
            };

            const docRef = await addDoc(collection(db, "employee_checkin"), checkinData);
            await checkTodayCheckin(selectedEmployee.employeeId); // อัพเดทสถานะ
            
            // แสดง Modal ตามสถานะ
            if (status.includes("มาปกติ")) {
                setLastCheckInMessage(`✅ เช็คอินสำเร็จ!\n${selectedEmployee.name}\nสาขา: ${branchName}\nเวลา: ${time}`);
                setShowSuccessModal(true);
            } else if (status.includes("มาสาย (ระดับ 1)")) {
                setLastCheckInMessage(`⚠️ คุณมาสาย! ${globalSettings.lateFine20} บาท\nกำหนดเข้างาน: ${dayjs(lateAfter * 60000).format("HH:mm")}\nเวลาเช็คอิน: ${time}`);
                setShowLateLevel1Modal(true);
            } else if (status.includes("มาสาย (ระดับ 2)")) {
                setLastCheckInMessage(`🚨 คุณมาสายมาก! ${globalSettings.lateFine50} บาท\nกำหนดเข้างาน: ${dayjs(t1 * 60000).format("HH:mm")}\nเวลาเช็คอิน: ${time}`);
                setShowLateLevel2Modal(true);
            } else { // ขาดงาน/สายมาก
                setLastCheckInMessage(`❌ คุณมาสายเกินกว่าที่กำหนด\nเวลาเช็คอิน: ${time}\nระบบได้บันทึกเป็น ${status} (${fine} บาท) แล้ว`);
                setShowLateLevel3Modal(true);
            }

        } 
        // --- 🔵 กรณี CHECK-OUT ---
        else if (isCheckedIn && !isCheckedOut) {
            await handleCheckOutConfirmed(time, formattedTimestamp);
        }
        
    } catch (error) {
        console.error("Error saving check-in/out", error);
        message.error("การบันทึกข้อมูลล้มเหลว");
    }
  }, [selectedEmployee, todayCheckin, branchDataMap, globalSettings, lineProfile, currentTimeMinutes]);


  // 5. Function handleCheckOutConfirmed
  const handleCheckOutConfirmed = async (checkoutTime, checkoutTimestamp) => {
    if (!todayCheckin || todayCheckin.checkoutTime !== "-") return;
    
    try {
        const checkinRef = doc(db, "employee_checkin", todayCheckin.id);
        await updateDoc(checkinRef, { checkoutTime, checkoutTimestamp });

        const msg = `✅ เช็คเอาท์สำเร็จ!\n${selectedEmployee.name}\nสาขา: ${todayCheckin.branch}\nเวลา: ${checkoutTime}`;
        setCheckoutMessage(msg);
        setTimeout(() => setShowCheckoutModal(true), 60);
        await checkTodayCheckin(selectedEmployee.employeeId);
    } catch (error) {
        console.error(error);
        message.error("บันทึกเช็คเอาท์ไม่สำเร็จ");
    }
  };


  // 6. Function handleCheckOut (Trigger Scan)
  const handleCheckOut = () => {
    if (!todayCheckin || todayCheckin.checkoutTime !== "-") {
        message.warning("คุณเช็คเอาท์ไปแล้ว");
        return;
    }
    hasScannedRef.current = false;
    setScanning(true);
  };
  
  // 7. Function handleCheckIn (Trigger Scan)
  const handleCheckIn = () => {
    if (todayCheckin && todayCheckin.checkinTime) {
        message.warning("คุณเช็คอินไปแล้ว");
        return;
    }
    hasScannedRef.current = false;
    setScanning(true);
  };

  const handleSelect = (value) => {
    const emp = employees.find(e => e.employeeId === value);
    setSelectedEmployee(emp);
  };

  const getStatusColor = (status) => {
    if (status?.includes("ปกติ")) return "success";
    if (status?.includes("ระดับ 1")) return "warning";
    if (status?.includes("ระดับ 2")) return "volcano";
    if (status?.includes("ขาดงาน") || status?.includes("นอกพื้นที่")) return "error";
    return "default";
  };
  
  const isCheckedIn = todayCheckin && todayCheckin.checkinTime;
  const isCheckedOut = todayCheckin && todayCheckin.checkoutTime && todayCheckin.checkoutTime !== "-";
  
  // Loading State
  if (!globalSettings || !lineProfile || !dataLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5' }}>
        <Spin size="large" />
        <Text style={{ marginTop: 15 }}>กำลังโหลดข้อมูล...</Text>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* 🔴 Header/Status Bar */}
      <div style={{ 
          background: 'linear-gradient(135deg, #FF6539 0%, #FF9739 100%)', 
          padding: '40px 20px 80px 20px', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <Title level={4} style={{ color: '#fff', margin: 0 }}>
          {dayjs().format("dddd")}
        </Title>
        <Title level={2} style={{ color: '#fff', margin: '5px 0 10px 0' }}>
          {dayjs().format("D MMMM YYYY")}
        </Title>
        <Row gutter={16} style={{ marginTop: 20 }}>
          <Col span={24}>
            <div style={{ textAlign: 'center', background: "rgba(255,255,255,0.2)", padding: 10, borderRadius: 8 }}>
              <Text strong style={{ color: "#fff", fontSize: 24 }}>
                {currentTime.format("HH:mm:ss")}
              </Text>
              <Text style={{ display: 'block', color: "rgba(255,255,255,0.8)", fontSize: 12 }}>เวลาปัจจุบัน</Text>
            </div>
          </Col>
        </Row>
      </div>

      {/* 🔹 Main Content Area */}
      <div style={{ padding: "0 20px", marginTop: -60 }}>
        {/* 1. Profile / Employee Selection Card */}
        <Card bordered={false} style={{ borderRadius: 20, boxShadow: "0 8px 20px rgba(0,0,0,0.08)", marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <Avatar size={64} src={lineProfile.pictureUrl} icon={<UserOutlined />} style={{ border: "3px solid #FF6539", backgroundColor: "#fff", color: "#FF6539" }} />
            <div style={{ flex: 1 }}>
              {firstTime ? (
                <>
                  <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>กรุณาระบุตัวตนครั้งแรก</Text>
                  <Select 
                    showSearch 
                    placeholder="ค้นหาชื่อของคุณ" 
                    onChange={handleSelect} 
                    value={selectedEmployee?.employeeId} 
                    style={{ width: '100%', marginTop: 5 }} 
                    size="large"
                    disabled={!dataLoaded}
                  >
                    {employees.map(emp => (
                      <Option key={emp.employeeId} value={emp.employeeId}>
                        {emp.name} ({emp.employeeId})
                      </Option>
                    ))}
                  </Select>
                  {selectedEmployee && <Button type="primary" onClick={() => handleScanSuccess("https://example.com/checkin?branch=สาขาหลัก")} style={{ marginTop: 10 }}>ยืนยันตัวตน</Button>}
                </>
              ) : (
                <>
                  <Title level={4} style={{ margin: 0 }}>
                    {selectedEmployee?.name}
                  </Title>
                  <Text type="secondary" style={{ display: 'block' }}>
                    {selectedEmployee?.employeeId} | {selectedEmployee?.branch || "ไม่ระบุสาขา"}
                  </Text>
                  {todayCheckin && todayCheckin.fine > 0 && (
                      <Tag color="error" style={{ marginTop: 5 }}>ปรับ: {todayCheckin.fine} บาท</Tag>
                  )}
                </>
              )}
            </div>
          </div>
        </Card>

        {/* 2. Check-in/Check-out Status */}
        {!firstTime && selectedEmployee && (
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small" style={{ backgroundColor: isCheckedIn ? "#f6ffed" : "#f5f5f5", borderColor: isCheckedIn ? "#b7eb8f" : "#f0f0f0" }}>
                <div style={{ textAlign: "center" }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>เวลาเข้างาน</Text>
                  <div style={{ fontSize: 20, fontWeight: "bold", color: isCheckedIn ? "#389e0d" : "#bfbfbf", marginTop: 5 }}>
                    {todayCheckin?.checkinTime || "--:--"}
                  </div>
                  {isCheckedIn && <Tag color={getStatusColor(todayCheckin?.status)} style={{ marginTop: 5 }}>{todayCheckin?.status}</Tag>}
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" style={{ backgroundColor: isCheckedOut ? "#e6f7ff" : "#f5f5f5", borderColor: isCheckedOut ? "#91d5ff" : "#f0f0f0" }}>
                <div style={{ textAlign: "center" }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>เวลาออกงาน</Text>
                  <div style={{ fontSize: 20, fontWeight: "bold", color: isCheckedOut ? "#096dd9" : "#bfbfbf", marginTop: 5 }}>
                    {todayCheckin?.checkoutTime && todayCheckin.checkoutTime !== "-" ? todayCheckin.checkoutTime : "--:--"}
                  </div>
                  {isCheckedOut && <Tag color="blue" style={{ marginTop: 5 }}>เช็คเอาท์แล้ว</Tag>}
                </div>
              </Card>
            </Col>
          </Row>
        )}

        {/* 3. Action Buttons */}
        {!firstTime && selectedEmployee && (
          <div style={{ marginTop: 20 }}>
            {/* Check-in Button */}
            <Button
              type="primary"
              size="large"
              block
              icon={<ScanOutlined />}
              onClick={handleCheckIn}
              disabled={isCheckedIn || scanning}
              loading={scanning && !isCheckedIn}
              style={{ marginBottom: 10, borderRadius: 10, height: 50, background: isCheckedIn ? "#52c41a" : "#FF6539", borderColor: isCheckedIn ? "#52c41a" : "#FF6539" }}
            >
              {isCheckedIn ? "เช็คอินแล้ววันนี้" : "ลงเวลาเข้างาน (สแกน QR)"}
            </Button>

            {/* Check-out Button */}
            <Button
              type="default"
              size="large"
              block
              icon={<LogoutOutlined />}
              onClick={handleCheckOut}
              disabled={!isCheckedIn || isCheckedOut || scanning}
              loading={scanning && isCheckedIn}
              style={{ borderRadius: 10, height: 50, color: isCheckedOut ? "#bfbfbf" : "#000" }}
            >
              {isCheckedOut ? "เช็คเอาท์แล้ว" : "ลงเวลาออกงาน (สแกน QR)"}
            </Button>
            
            <Alert
              message="คำแนะนำ"
              description="ในการสแกน QR Code คุณต้องอยู่ภายในรัศมีของสาขา"
              type="info"
              showIcon
              style={{ marginTop: 20, borderRadius: 10 }}
            />
          </div>
        )}
      </div>

      {/* --- ✅ Modal สแกน QR (แก้ไข ID เป็น 'reader') --- */}
      <Modal 
        open={scanning} 
        title="สแกน QR Code เพื่อลงเวลา"
        onCancel={() => setScanning(false)}
        footer={null}
        centered
        maskClosable={false}
        destroyOnClose={true} // สำคัญ: ทำลาย DOM เพื่อให้ useEffect สร้างใหม่ได้
      >
        <div 
          id="reader" 
          style={{ 
            width: "100%", 
            maxWidth: 400, 
            margin: "10px auto", 
            border: "1px solid #FF6539",
            borderRadius: 8
          }} 
        />
        <p style={{ textAlign: 'center', marginTop: 10, color: '#8c8c8c' }}>
          นำ QR Code สาขาให้อยู่ในกรอบ
        </p>
      </Modal>

      {/* --- Modal เช็คอินสำเร็จ --- */}
      <Modal open={showSuccessModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <CheckCircleFilled style={{ fontSize: 60, color: '#52c41a', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#52c41a' }}>เช็คอินสำเร็จ</Title>
         <div style={{ background: '#f6ffed', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #b7eb8f' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <Button type="primary" block size="large" onClick={()=>setShowSuccessModal(false)} style={{ borderRadius: 10 }}>ปิด</Button>
      </Modal>

      {/* --- Modal มาสาย Level 1 --- */}
      <Modal open={showLateLevel1Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <ClockCircleOutlined style={{ fontSize: 60, color: '#faad14', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#faad14' }}>มาให้ไวกว่านี้นะ</Title>
         <div style={{ background: '#fffbe6', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #ffe58f' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <Button type="primary" block size="large" onClick={()=>setShowLateLevel1Modal(false)} style={{ borderRadius: 10 }}>รับทราบ</Button>
      </Modal>

      {/* --- Modal มาสาย Level 2 --- */}
      <Modal open={showLateLevel2Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <FieldTimeOutlined style={{ fontSize: 60, color: '#ff7a45', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#ff7a45' }}>สายมากแล้ว! กรุณาเข้างาน</Title>
         <div style={{ background: '#fff2e8', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #ffbb96' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <Button type="primary" block size="large" onClick={()=>setShowLateLevel2Modal(false)} style={{ borderRadius: 10 }}>รับทราบ</Button>
      </Modal>

      {/* --- Modal มาสาย Level 3 / ขาดงาน --- */}
      <Modal open={showLateLevel3Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <CloseCircleFilled style={{ fontSize: 60, color: '#ff4d4f', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#ff4d4f' }}>วันนี้มาสายเกินไปแล้วนะ</Title>
         <div style={{ background: '#fff1f0', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #ffa39e' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <Button type="primary" danger block size="large" onClick={()=>setShowLateLevel3Modal(false)} style={{ borderRadius: 10 }}>รับทราบ</Button>
      </Modal>

      {/* --- Modal นอกพื้นที่ --- */}
      <Modal open={showOutsideModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
        <EnvironmentOutlined style={{ fontSize: 60, color: '#1890ff', marginBottom: 20 }} />
        <Title level={4} style={{ color: '#1890ff' }}>คุณอยู่นอกพื้นที่เช็คอิน</Title>
        <div style={{ background: '#e6f7ff', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #91d5ff' }}>
            <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
        </div>
        <Button type="primary" block size="large" onClick={()=>setShowOutsideModal(false)} style={{ borderRadius: 10 }}>รับทราบ</Button>
      </Modal>
      
      {/* --- Modal เช็คเอาท์สำเร็จ --- */}
      <Modal open={showCheckoutModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <LogoutOutlined style={{ fontSize: 60, color: '#096dd9', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#096dd9' }}>เช็คเอาท์เรียบร้อย</Title>
         <div style={{ background: '#e6f7ff', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #91d5ff' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{checkoutMessage}</pre>
         </div>
         <Button type="primary" block size="large" onClick={()=>setShowCheckoutModal(false)} style={{ borderRadius: 10 }}>ปิด</Button>
      </Modal>

      {/* --- Modal ยินดีต้อนรับ (ครั้งแรก) --- */}
      <Modal open={showFirstTimeModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <CheckCircleFilled style={{ fontSize: 60, color: '#52c41a', marginBottom: 20 }} />
         <Title level={4} style={{ marginTop: 10 }}>ยินดีต้อนรับ</Title>
         <div style={{ background: '#f6ffed', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #b7eb8f' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{firstTimeCheckInMessage}</pre>
         </div>
         <Button type="primary" block size="large" onClick={()=>setShowFirstTimeModal(false)} style={{ borderRadius: 10 }}>เริ่มต้นใช้งาน</Button>
      </Modal>

    </div>
  );
}