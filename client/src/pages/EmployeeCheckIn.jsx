import React, { useEffect, useState, useRef } from "react";
import { Select, Button, Card, Typography, message, Modal, Spin, Avatar, Tag, Row, Col } from "antd"; 
import { 
  ScanOutlined, 
  UserOutlined, 
  EnvironmentOutlined, 
  ClockCircleOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LogoutOutlined
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
  const [scanning, setScanning] = useState(false);
  const [todayCheckin, setTodayCheckin] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // --- Modals state ---
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastCheckInMessage, setLastCheckInMessage] = useState("");
  
  // ✅ แยก Modal ตามระดับความสาย
  const [showLateLevel1Modal, setShowLateLevel1Modal] = useState(false); // ระดับ 1: มาให้ไวกว่านี้นะ
  const [showLateLevel2Modal, setShowLateLevel2Modal] = useState(false); // ระดับ 2: วิ่งงงงง
  const [showLateLevel3Modal, setShowLateLevel3Modal] = useState(false); // ระดับ 3: สายแล้วนะ กลับบ้านไปนอนเลย

  const [showOutsideModal, setShowOutsideModal] = useState(false);
  const [showFirstTimeModal, setShowFirstTimeModal] = useState(false);
  const [firstTimeCheckInMessage, setFirstTimeCheckInMessage] = useState("");
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");

  const qrRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const hasScannedRef = useRef(false);
  const [branchCoordsMap, setBranchCoordsMap] = useState({});
  const [settings, setSettings] = useState(null);

  const [currentTime, setCurrentTime] = useState(dayjs());
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = dayjs();
    return now.hour() * 60 + now.minute();
  });

  const normalizeBranch = (s) => (s || "").toString().trim();
  const toRad = (deg) => (deg * Math.PI) / 180;
  
  // คำนวณระยะห่าง (Haversine Formula)
  const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ขอพิกัด GPS
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
      if (!hasLeaveToday && settings) {
        setLastCheckInMessage(`❌ พนักงานไม่ได้เช็คอินวันนี้ (${today})`);
      }
    }
  };

  // 1. Main Load Data
  useEffect(() => {
    const startLiff = async () => {
      try {
        const settingsRef = doc(db, "settings", "checkin");
        const settingsSnap = await getDoc(settingsRef);
        let loadedSettings = null;

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          loadedSettings = {
            ...data,
            startTimeMinutes: timeToMinutes(data.startTime), 
            lateAfterMinutes: timeToMinutes(data.lateAfter), 
            lateThreshold1Minutes: timeToMinutes(data.lateThreshold1),
            lateThreshold2Minutes: timeToMinutes(data.lateThreshold2),
            checkoutTimeMinutes: timeToMinutes(data.checkoutTime), 
          };
        } else {
           loadedSettings = {
            radius: 100, allowOutside: false, lateFine20: 20, lateFine50: 50, absentFine: 50,
            startTimeMinutes: 480, lateAfterMinutes: 485, lateThreshold1Minutes: 495, lateThreshold2Minutes: 510, checkoutTimeMinutes: 960,
            checkoutTime: "16:00"
          };
        }
        setSettings(loadedSettings);
      } catch (e) {
        console.error("Failed to fetch settings", e);
        setSettings({ radius: 100, startTimeMinutes: 480, checkoutTimeMinutes: 960 }); 
      }
      
      await initLiff("2008408737-4x2nLQp8"); // LIFF ID เดิมของคุณ
      const profile = await getProfile();
      const userId = getLineUserId();
      if (!profile || !userId) {
          message.error("ไม่สามารถดึง LINE Profile ได้");
          return;
      }
      setLineProfile({ ...profile, userId });

      try {
        const branchSnap = await getDocs(collection(db, "branches"));
        const coordsMap = {};
        branchSnap.docs.forEach(doc => {
          const data = doc.data();
          const branchName = data.name;
          const gpsString = data.gps; 
          if (branchName && gpsString) {
            const [lat, lng] = gpsString.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
              coordsMap[normalizeBranch(branchName)] = { lat, lng };
            }
          }
        });
        setBranchCoordsMap(coordsMap);
      } catch (e) { console.error(e); }

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
            html5QrCodeRef.current.stop().catch(err => console.error(err));
        }
    };
  }, []);

  // 2. Update Timer
  useEffect(() => {
    const timeInterval = setInterval(() => {
      const now = dayjs();
      setCurrentTime(now);
      setCurrentTimeMinutes(now.hour() * 60 + now.minute());
    }, 1000); 
    return () => clearInterval(timeInterval);
  }, []);

  // 3. Sync Data
  useEffect(() => {
    const dataInterval = setInterval(() => {
      if (selectedEmployee && !firstTime && settings) {
        checkTodayCheckin(selectedEmployee.employeeId);
      }
    }, 60000); 
    return () => clearInterval(dataInterval);
  }, [selectedEmployee, firstTime, settings]); 


  // ฟังก์ชันเริ่มสแกน
  const startQRScan = async () => {
    if (!qrRef.current || !selectedEmployee || scanning || !settings || !html5QrCodeRef.current) return;
    
    setScanning(true);
    hasScannedRef.current = false;

    try {
      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async (decodedText) => {
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;
          await stopScanner(); 

          let branchName = "";
          try {
            const url = new URL(decodedText);
            branchName = decodeURIComponent(url.searchParams.get("branch") || "").trim();
            if (!branchName) throw new Error("No branch");
          } catch (err) {
            message.error("QR Code ไม่ถูกต้อง");
            setScanning(false);
            return;
          }

          let outsideArea = false;
          let debugMessage = "";

          try {
            const pos = await getCurrentPosition();
            const { latitude, longitude, accuracy } = pos.coords; 
            const coords = branchCoordsMap[normalizeBranch(branchName)];
            
            if (coords) {
              const dist = haversineMeters(latitude, longitude, coords.lat, coords.lng);
              const adjustedDistance = Math.max(0, dist - accuracy);
              
              if (adjustedDistance > settings.radius) {
                 outsideArea = true; 
                 debugMessage = `วัดได้: ${dist.toFixed(0)} ม. (รัศมี ${settings.radius})\nGPS เพี้ยน: +/-${accuracy.toFixed(0)} ม.\nระยะคำนวณ: ${adjustedDistance.toFixed(0)} ม.`;
              }
            } else { 
                outsideArea = true;
                debugMessage = "ไม่พบพิกัดสาขาในระบบ";
            }
          } catch (e) { 
              outsideArea = true; 
              debugMessage = "จับสัญญาณ GPS ไม่ได้ กรุณาเปิด Location";
          }

          const now = dayjs();
          const nowTotalMinutes = now.hour() * 60 + now.minute();
          
          const isCheckedIn = !!(todayCheckin && todayCheckin.checkinTime && todayCheckin.checkinTime !== "-");
          const isCheckedOut = !!(todayCheckin && todayCheckin.checkoutTime && todayCheckin.checkoutTime !== "-");
          const isTimeToCheckOut = nowTotalMinutes >= settings.checkoutTimeMinutes;

          try {
            if (isCheckedIn && !isCheckedOut && isTimeToCheckOut) {
              await handleCheckOut(); 
            } else if (isCheckedIn && !isCheckedOut && !isTimeToCheckOut) {
               message.warning(`ยังไม่ถึงเวลาเช็คเอาท์ (${settings.checkoutTime} น.)`);
            } else if (!isCheckedIn) {
               await handleCheckIn(branchName, { outsideArea, debugMessage }); 
            } else {
               message.info("วันนี้เช็คเอาท์เรียบร้อยแล้ว");
            }
          } catch (e) { 
              console.error(e);
              message.error("เกิดข้อผิดพลาดในการบันทึก"); 
          }
        },
        (errorMessage) => {}
      );
    } catch (e) {
      console.error(e);
      setScanning(false);
    }
  };

  // Auto Start Scanner logic
  useEffect(() => {
    const qrElement = document.getElementById("qr-reader");
    
    // ✅ เพิ่ม Modal ใหม่เข้าไปในเงื่อนไขหยุดสแกน
    const isModalOpen = showSuccessModal || showLateLevel1Modal || showLateLevel2Modal || showLateLevel3Modal || showOutsideModal || showFirstTimeModal || showCheckoutModal;

    if (settings && lineProfile && dataLoaded && qrElement && selectedEmployee && !todayCheckin && !isModalOpen) {
      if (!html5QrCodeRef.current) {
        try {
          html5QrCodeRef.current = new Html5Qrcode("qr-reader");
        } catch (e) {
          console.error("Error creating Html5Qrcode:", e);
        }
      }

      if (html5QrCodeRef.current && !scanning) {
         const timer = setTimeout(() => {
             startQRScan();
         }, 800);
         return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, lineProfile, dataLoaded, selectedEmployee, todayCheckin, showSuccessModal, showLateLevel1Modal, showLateLevel2Modal, showLateLevel3Modal, showOutsideModal, showCheckoutModal]); 


  const handleSelect = (value) => {
    const emp = employees.find(e => e.employeeId === value);
    setSelectedEmployee(emp);
  };

  const calculateStatus = (timeString) => {
    if (!settings) return { status: "กำลังโหลดตั้งค่า...", fine: 0 }; 
    const [hour, minute] = timeString.split(":").map(Number);
    const currentTotalMinutes = hour * 60 + minute;

    const { lateAfterMinutes, lateThreshold1Minutes, lateThreshold2Minutes, lateFine20, lateFine50, absentFine } = settings;

    if (currentTotalMinutes <= lateAfterMinutes) return { status: "มาปกติ", fine: 0 };
    if (currentTotalMinutes <= lateThreshold1Minutes) return { status: "มาสาย (ระดับ 1)", fine: lateFine20 };
    if (currentTotalMinutes <= lateThreshold2Minutes) return { status: "มาสาย (ระดับ 2)", fine: lateFine50 };
    return { status: "ขาดงาน/สายมาก", fine: absentFine };
  };

  const handleCheckIn = async (branchName, options = {}) => {
    if (!selectedEmployee) throw new Error("กรุณาเลือกพนักงาน");
    const now = dayjs();
    const formattedTimestamp = now.format("YYYY-MM-DD HH:mm:ss");
    const date = now.format("YYYY-MM-DD");
    const time = now.format("HH:mm");
    let { status, fine } = calculateStatus(time);
    
    if (options.outsideArea) { 
        status = "นอกพื้นที่"; 
        fine = 0; 
        if (options.debugMessage) {
            setLastCheckInMessage(`❌ อยู่นอกพื้นที่\n${options.debugMessage}`);
        } else {
            setLastCheckInMessage(`❌ อยู่นอกพื้นที่\nตรวจสอบ GPS หรือติดต่อผู้ดูแล`);
        }
    }

    const isFirstTimeCheckIn = firstTime;

    try {
      if (firstTime) {
        const employeeRef = doc(db, "employees", selectedEmployee.employeeId);
        const existingBranches = Array.isArray(selectedEmployee.branches) ? selectedEmployee.branches : (selectedEmployee.branch ? [selectedEmployee.branch] : []);
        const mergedBranches = Array.from(new Set([...existingBranches, branchName]));
        const employeeData = { ...selectedEmployee, lineUserId: lineProfile.userId, branches: mergedBranches, branch: mergedBranches[0] };
        delete employeeData.employeeId;
        await setDoc(employeeRef, employeeData, { merge: true });
        setFirstTime(false);
      }

      await addDoc(collection(db, "employee_checkin"), {
        employeeId: selectedEmployee.employeeId,
        name: selectedEmployee.name,
        phone: selectedEmployee.phone || "",
        department: selectedEmployee.department || "",
        branch: branchName,
        lineUserId: lineProfile.userId,
        lineDisplayName: lineProfile.displayName || "",
        lineProfileImage: lineProfile.pictureUrl || "",
        date, checkinTime: time, checkoutTime: "-", timestamp: formattedTimestamp, status, fine,
      });
      
      let messageForModal = `✅ เช็คอินสำเร็จ!\nชื่อ: ${selectedEmployee.name}\nสาขา: ${branchName}\nเวลา: ${time}\nสถานะ: ${status}`;
      
      if (!options.outsideArea) {
          setLastCheckInMessage(messageForModal);
      }
      
      await checkTodayCheckin(selectedEmployee.employeeId);

      if (isFirstTimeCheckIn) {
        setFirstTimeCheckInMessage(messageForModal);
        setTimeout(() => setShowFirstTimeModal(true), 60);
      } else {
        const totalMinutes = now.hour() * 60 + now.minute();
        const { lateAfterMinutes, lateThreshold1Minutes, lateThreshold2Minutes } = settings;

        if (options.outsideArea) {
             setTimeout(() => setShowOutsideModal(true), 60);
        }
        // ✅ ระดับ 1: สายเล็กน้อย
        else if (totalMinutes > lateAfterMinutes && totalMinutes <= lateThreshold1Minutes) {
             setTimeout(() => setShowLateLevel1Modal(true), 60);
        }
        // ✅ ระดับ 2: สายปานกลาง
        else if (totalMinutes > lateThreshold1Minutes && totalMinutes <= lateThreshold2Minutes) {
             setTimeout(() => setShowLateLevel2Modal(true), 60);
        }
        // ✅ ระดับ 3: สายมาก
        else if (totalMinutes > lateThreshold2Minutes) {
             setTimeout(() => setShowLateLevel3Modal(true), 60);
        }
        // ✅ ทันเวลา
        else {
             setTimeout(() => setShowSuccessModal(true), 60);
        }
      }
    } catch (error) {
      console.error(error);
      message.error("บันทึกไม่สำเร็จ");
    }
  };

  const handleCheckOut = async () => {
    if (!selectedEmployee || !todayCheckin) return message.error("ไม่พบข้อมูล");
    const now = dayjs();
    try {
      const checkoutTime = now.format("HH:mm");
      const checkoutTimestamp = now.format("YYYY-MM-DD HH:mm:ss");
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

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
        }
      } catch (e) {}
      setScanning(false);
      hasScannedRef.current = false;
    }
  };

  if (!settings || !lineProfile || !dataLoaded) {
    let loadingTip = "กำลังโหลด...";
    if (settings) {
        const isCheckoutTime = currentTimeMinutes >= settings.checkoutTimeMinutes;
        loadingTip = isCheckoutTime ? "กำลังเตรียมระบบเช็คเอาท์..." : "กำลังเตรียมระบบเช็คอิน...";
    }
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f5f7fa' }}>
        <Spin size="large" />
        <Text style={{ marginTop: 20, color: '#999' }}>{loadingTip}</Text>
      </div>
    );
  }

  const isCheckedIn = !!(todayCheckin && todayCheckin.checkinTime && todayCheckin.checkinTime !== "-");
  const isCheckedOut = !!(todayCheckin && todayCheckin.checkoutTime && todayCheckin.checkoutTime !== "-");
  const isTimeToCheckOut = currentTimeMinutes >= settings.checkoutTimeMinutes;

  const getButtonText = () => {
    if (firstTime) return "เลือกชื่อเพื่อเริ่มใช้งาน";
    if (scanning) return "กำลังสแกน...";
    if (isCheckedIn && !isCheckedOut && isTimeToCheckOut) return "สแกนเช็คเอาท์";
    if (isCheckedOut) return "เช็คเอาท์แล้ว";
    return "สแกนเช็คอิน";
  }

  const getStatusColor = (status) => {
      if (!status) return 'default';
      if (status.includes('ปกติ')) return 'success';
      if (status.includes('สาย')) return 'warning';
      if (status.includes('ขาด') || status.includes('พื้นที่')) return 'error';
      return 'default';
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fa", fontFamily: "'Sarabun', sans-serif" }}>
      
      {/* 🔹 Header Gradient */}
      <div style={{
        background: "linear-gradient(135deg, #FF6539 0%, #ff8e6f 100%)",
        padding: "30px 20px 80px 20px",
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        color: "white",
        boxShadow: "0 4px 15px rgba(255, 101, 57, 0.3)"
      }}>
        <Row justify="space-between" align="middle">
            <Col>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{dayjs().format("dddd, D MMMM YYYY")}</Text>
                <Title level={3} style={{ color: "white", margin: 0 }}>สวัสดี, {lineProfile.displayName.split(" ")[0]}</Title>
            </Col>
            <Col>
                <div style={{ textAlign: "right" }}>
                    <Title level={2} style={{ color: "white", margin: 0, fontWeight: 300 }}>{currentTime.format("HH:mm")}</Title>
                    <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>เวลาปัจจุบัน</Text>
                </div>
            </Col>
        </Row>
      </div>

      {/* 🔹 Main Content Area */}
      <div style={{ padding: "0 20px", marginTop: -60 }}>
        
        {/* 1. Profile / Employee Selection Card */}
        <Card bordered={false} style={{ borderRadius: 20, boxShadow: "0 8px 20px rgba(0,0,0,0.08)", marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <Avatar 
                    size={64} 
                    src={lineProfile.pictureUrl} 
                    icon={<UserOutlined />} 
                    style={{ border: "3px solid #FF6539", backgroundColor: "#fff", color: "#FF6539" }}
                />
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
                                filterOption={(input, option) => 
                                    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                            >
                                {employees.map((emp) => (
                                    <Option key={emp.employeeId} value={emp.employeeId}>{emp.name}</Option>
                                ))}
                            </Select>
                        </>
                    ) : (
                        <>
                            <Title level={5} style={{ margin: 0, color: "#333" }}>{selectedEmployee?.name || "พนักงาน"}</Title>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                <EnvironmentOutlined /> {selectedEmployee?.branch || "ไม่ระบุสาขา"}
                            </Text>
                            <div style={{ marginTop: 4 }}>
                                <Tag color="orange">รหัส: {selectedEmployee?.employeeId}</Tag>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Card>
        
        {/* 3. Action Button (Scanner) */}
        <div style={{ marginBottom: 30 }}>
            <div id="qr-reader" ref={qrRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: scanning ? 20 : 0, display: scanning ? 'block' : 'none' }} />
            
            <Button 
                type="primary" 
                block 
                size="large" 
                disabled={(firstTime && !selectedEmployee) || isCheckedOut}
                onClick={startQRScan}
                loading={scanning}
                icon={!scanning && <ScanOutlined style={{ fontSize: 24 }} />}
                style={{ 
                    height: 60, 
                    borderRadius: 15, 
                    fontSize: 18, 
                    fontWeight: "bold",
                    background: isCheckedOut ? "#d9d9d9" : "linear-gradient(90deg, #FF6539 0%, #ff8e6f 100%)",
                    borderColor: "transparent",
                    boxShadow: isCheckedOut ? "none" : "0 10px 20px rgba(255, 101, 57, 0.3)",
                    marginTop: 10
                }}
            >
                {getButtonText()}
            </Button>

            {!firstTime && !isCheckedOut && !scanning && (
                <div style={{ textAlign: 'center', marginTop: 15 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {isTimeToCheckOut 
                            ? "ถึงเวลาเช็คเอาท์แล้ว กรุณาสแกน QR Code" 
                            : `เวลาเช็คเอาท์: ${settings?.checkoutTime} น.`
                        }
                    </Text>
                </div>
            )}
        </div>

        {/* 2. Today's Status Timeline */}
        {!firstTime && (
            <Card title="สถานะวันนี้" bordered={false} style={{ borderRadius: 20, boxShadow: "0 4px 15px rgba(0,0,0,0.05)", marginBottom: 20 }}>
                <Row gutter={[16, 16]}>
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
                                {isCheckedOut && <Tag color="blue" style={{ marginTop: 5 }}>สำเร็จ</Tag>}
                            </div>
                        </Card>
                    </Col>
                </Row>
            </Card>
        )}

        {/* 4. Logout / Close */}
        <div style={{ textAlign: 'center', paddingBottom: 40 }}>
            <Button type="text" icon={<CloseCircleFilled />} onClick={() => window.liff?.closeWindow?.()} style={{ color: "#999" }}>
                ปิดหน้าต่าง
            </Button>
        </div>

      </div>

      {/* --- Modal เช็คอินทันเวลา --- */}
      <Modal open={showSuccessModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <CheckCircleFilled style={{ fontSize: 60, color: '#52c41a', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#52c41a' }}>สุดยอด! มาทันเวลา</Title>
         <img src="/ontime.gif" alt="On time" style={{ width: 200, marginBottom: 20 }} />
         <div style={{ background: '#f6ffed', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #b7eb8f' }}>
            <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <Button type="primary" block size="large" onClick={()=>setShowSuccessModal(false)} style={{ borderRadius: 10, background: '#52c41a' }}>ตกลง</Button>
      </Modal>

      {/* --- Modal เช็คเอาท์ --- */}
      <Modal open={showCheckoutModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <LogoutOutlined style={{ fontSize: 60, color: '#1890ff', marginBottom: 20 }} />
         <Title level={4}>เช็คเอาท์สำเร็จ</Title>
         <div style={{ background: '#e6f7ff', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #91d5ff' }}>
            <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{checkoutMessage}</pre>
         </div>
         <Button type="primary" block size="large" onClick={()=>setShowCheckoutModal(false)} style={{ borderRadius: 10 }}>ตกลง</Button>
      </Modal>

      {/* --- Modal นอกพื้นที่ --- */}
      <Modal open={showOutsideModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <EnvironmentOutlined style={{ fontSize: 60, color: '#faad14', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#faad14' }}>อยู่นอกพื้นที่!</Title>
         <div style={{ background: '#fffbe6', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #ffe58f' }}>
            <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <Button type="primary" danger block size="large" onClick={()=>setShowOutsideModal(false)} style={{ borderRadius: 10 }}>รับทราบ</Button>
      </Modal>

      {/* --- Modal ระดับ 1: มาสายเล็กน้อย --- */}
      <Modal open={showLateLevel1Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <ClockCircleOutlined style={{ fontSize: 60, color: '#faad14', marginBottom: 20 }} />
         <Title level={4} style={{ color: '#faad14' }}>มาให้ไวกว่านี้นะ</Title>
         <div style={{ background: '#fffbe6', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #ffe58f' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <Button type="primary" style={{ background: '#faad14', borderColor: '#faad14', borderRadius: 10 }} block size="large" onClick={()=>setShowLateLevel1Modal(false)}>รับทราบ</Button>
      </Modal>

      {/* --- Modal ระดับ 2: สายปานกลาง --- */}
      <Modal open={showLateLevel2Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <div style={{ fontSize: 60, marginBottom: 20 }}>🏃💨</div>
         <Title level={3} style={{ color: '#fa541c' }}>วิ่งงงงงงงง</Title>
         <div style={{ background: '#fff2e8', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #ffbb96' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <Button type="primary" danger block size="large" onClick={()=>setShowLateLevel2Modal(false)} style={{ borderRadius: 10 }}>รับทราบ</Button>
      </Modal>

      {/* --- Modal ระดับ 3: สายมาก/ขาดงาน --- */}
      <Modal open={showLateLevel3Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 0 }}>
         <CloseCircleFilled style={{ fontSize: 60, color: '#cf1322', marginBottom: 20, marginTop: 30 }} />
         <Title level={4} style={{ color: '#cf1322', padding: '0 20px' }}>สายแล้วนะ! กลับบ้านไปนอนเลยนะ</Title>
         <img src="/sleep.jpg" alt="Go to sleep" style={{ width: '100%', maxWidth: 300, marginBottom: 20, marginTop: 10, borderRadius: 8 }} />
         <div style={{ background: '#fff1f0', padding: 15, borderRadius: 10, margin: '0 20px 20px 20px', border: '1px solid #ffa39e' }}>
             <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{lastCheckInMessage}</pre>
         </div>
         <div style={{ padding: '0 20px 30px 20px' }}>
            <Button type="primary" danger block size="large" onClick={()=>setShowLateLevel3Modal(false)} style={{ borderRadius: 10 }}>รับทราบ</Button>
         </div>
      </Modal>

      {/* --- Modal ยินดีต้อนรับ (ครั้งแรก) --- */}
      <Modal open={showFirstTimeModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
         <CheckCircleFilled style={{ fontSize: 60, color: '#52c41a', marginBottom: 20 }} />
         <Title level={4} style={{ marginTop: 10 }}>ยินดีต้อนรับ</Title>
         <div style={{ background: '#f6ffed', padding: 15, borderRadius: 10, margin: '20px 0', border: '1px solid #b7eb8f' }}>
            <pre style={{ margin: 0, fontFamily: 'Sarabun', whiteSpace: 'pre-wrap', color: '#333' }}>{firstTimeCheckInMessage}</pre>
         </div>
         <Button type="primary" block size="large" onClick={()=>setShowFirstTimeModal(false)} style={{ borderRadius: 10, background: '#52c41a' }}>เริ่มใช้งาน</Button>
      </Modal>

    </div>
  );
}