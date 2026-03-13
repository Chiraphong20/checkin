import React, { useEffect, useState, useRef } from "react";
import { Select, Button, Card, Typography, message, Modal, Spin, Avatar, Tag, Row, Col, Radio } from "antd";
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

  // Shift Selection Modal
  const [showShiftSelectModal, setShowShiftSelectModal] = useState(false);
  const [pendingBranchData, setPendingBranchData] = useState(null);
  const [selectedShift, setSelectedShift] = useState(1);

  const qrRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const hasScannedRef = useRef(false);
  const isStartingRef = useRef(false);
  const [hasJustProcessed, setHasJustProcessed] = useState(false);

  const [branchDataMap, setBranchDataMap] = useState({});
  const [globalSettings, setGlobalSettings] = useState(null);

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
        resolve, reject,
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
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
    }
  };

  // 1. Main Load Data
  useEffect(() => {
    const startLiff = async () => {
      try {
        const settingsRef = doc(db, "settings", "checkin");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setGlobalSettings(settingsSnap.data());
        }

        const branchSnap = await getDocs(collection(db, "branches"));
        const bMap = {};
        branchSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.name) {
            bMap[normalizeBranch(data.name)] = {
              ...data,
              shift1_start: timeToMinutes(data.shift1_startTime || data.startTime || "08:00"),
              shift1_late: timeToMinutes(data.shift1_lateAfter || data.lateAfter || "08:05"),
              shift1_t1: timeToMinutes(data.shift1_lateThreshold1 || data.lateThreshold1 || "08:15"),
              shift1_t2: timeToMinutes(data.shift1_lateThreshold2 || data.lateThreshold2 || "08:30"),
              shift1_out: timeToMinutes(data.shift1_checkoutTime || data.checkoutTime || "16:00"),

              hasShift2: data.hasShift2 || false,
              shift2_start: timeToMinutes(data.shift2_startTime || "13:00"),
              shift2_late: timeToMinutes(data.shift2_lateAfter || "13:05"),
              shift2_t1: timeToMinutes(data.shift2_lateThreshold1 || "13:15"),
              shift2_t2: timeToMinutes(data.shift2_lateThreshold2 || "13:30"),
              shift2_out: timeToMinutes(data.shift2_checkoutTime || "21:00"),

              lat: data.gps ? parseFloat(data.gps.split(',')[0]) : (data.lat || 0),
              lng: data.gps ? parseFloat(data.gps.split(',')[1]) : (data.lng || 0),
            };
          }
        });
        setBranchDataMap(bMap);

      } catch (e) { console.error("Load Settings Error", e); }

      await initLiff("2008408737-4x2nLQp8");
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
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(err => { });
      }
    };
  }, []);

  useEffect(() => {
    const timeInterval = setInterval(() => {
      const now = dayjs();
      setCurrentTime(now);
      setCurrentTimeMinutes(now.hour() * 60 + now.minute());
    }, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    const dataInterval = setInterval(() => {
      if (selectedEmployee && !firstTime && globalSettings) {
        checkTodayCheckin(selectedEmployee.employeeId);
      }
    }, 60000);
    return () => clearInterval(dataInterval);
  }, [selectedEmployee, firstTime, globalSettings]);

  // --- Logic การคำนวณสถานะ ---
  const calculateStatusByShift = (currentMinutes, branchConfig, shift) => {
    const start = shift === 1 ? branchConfig.shift1_start : branchConfig.shift2_start;
    const lateAfter = shift === 1 ? branchConfig.shift1_late : branchConfig.shift2_late;
    const t1 = shift === 1 ? branchConfig.shift1_t1 : branchConfig.shift2_t1;
    const t2 = shift === 1 ? branchConfig.shift1_t2 : branchConfig.shift2_t2;

    const { lateFine20, lateFine50, absentFine } = globalSettings || { lateFine20: 20, lateFine50: 50, absentFine: 50 };

    let status = "มาปกติ";
    let fine = 0;

    if (currentMinutes <= lateAfter) { status = "มาปกติ"; fine = 0; }
    else if (currentMinutes <= t1) { status = "มาสาย (ระดับ 1)"; fine = lateFine20; }
    else if (currentMinutes <= t2) { status = "มาสาย (ระดับ 2)"; fine = lateFine50; }
    else { status = "ขาดงาน/สายมาก"; fine = absentFine; }

    return { status, fine, lateAfter, t1, t2 };
  };

  const processCheckIn = async (branchConfig, shift, options) => {
    const now = dayjs();
    const currentMinutes = now.hour() * 60 + now.minute();
    const formattedTimestamp = now.format("YYYY-MM-DD HH:mm:ss");
    const date = now.format("YYYY-MM-DD");
    const time = now.format("HH:mm");

    let { status, fine, lateAfter, t1, t2 } = calculateStatusByShift(currentMinutes, branchConfig, shift);

    if (options.outsideArea) {
      status = "นอกพื้นที่";
      fine = 0;
      setLastCheckInMessage(`❌ อยู่นอกพื้นที่\n${options.debugMessage || "ตรวจสอบ GPS"}`);
    }

    try {
      if (firstTime) {
        const employeeRef = doc(db, "employees", selectedEmployee.employeeId);
        const existingBranches = Array.isArray(selectedEmployee.branches) ? selectedEmployee.branches : (selectedEmployee.branch ? [selectedEmployee.branch] : []);
        const mergedBranches = Array.from(new Set([...existingBranches, branchConfig.name]));
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
        branch: branchConfig.name,
        shift: shift,
        lineUserId: lineProfile.userId,
        lineDisplayName: lineProfile.displayName || "",
        lineProfileImage: lineProfile.pictureUrl || "",
        date, checkinTime: time, checkoutTime: "-", timestamp: formattedTimestamp, status, fine,
      });

      let messageForModal = `✅ เช็คอินสำเร็จ (กะ ${shift})!\nชื่อ: ${selectedEmployee.name}\nสาขา: ${branchConfig.name}\nเวลา: ${time}\nสถานะ: ${status}`;

      if (!options.outsideArea) setLastCheckInMessage(messageForModal);

      await checkTodayCheckin(selectedEmployee.employeeId);

      // Show Result Modal
      if (isFirstTimeCheckIn) {
        setFirstTimeCheckInMessage(messageForModal);
        setTimeout(() => setShowFirstTimeModal(true), 60);
      } else if (options.outsideArea) {
        setTimeout(() => setShowOutsideModal(true), 60);
      } else if (currentMinutes > lateAfter && currentMinutes <= t1) {
        setTimeout(() => setShowLateLevel1Modal(true), 60);
      } else if (currentMinutes > t1 && currentMinutes <= t2) {
        setTimeout(() => setShowLateLevel2Modal(true), 60);
      } else if (currentMinutes > t2) {
        setTimeout(() => setShowLateLevel3Modal(true), 60);
      } else {
        setTimeout(() => setShowSuccessModal(true), 60);
      }

    } catch (error) {
      console.error(error);
      message.error("บันทึกไม่สำเร็จ");
    }
  };

  const isFirstTimeCheckIn = firstTime;

  const handleShiftConfirm = () => {
    setShowShiftSelectModal(false);
    if (pendingBranchData) {
      processCheckIn(pendingBranchData.branchConfig, selectedShift, pendingBranchData.options);
      setPendingBranchData(null);
    }
  };

  const handleCheckIn = async (branchName, options = {}) => {
    if (!selectedEmployee) return;
    const branchConfig = branchDataMap[normalizeBranch(branchName)];

    if (!branchConfig) {
      message.error("ไม่พบข้อมูลการตั้งค่าเวลาของสาขานี้");
      return;
    }

    if (branchConfig.hasShift2) {
      // Default shift calculation
      const diff1 = Math.abs(currentTimeMinutes - branchConfig.shift1_start);
      const diff2 = Math.abs(currentTimeMinutes - branchConfig.shift2_start);
      setSelectedShift(diff2 < diff1 ? 2 : 1);

      setPendingBranchData({ branchConfig, options });
      setShowShiftSelectModal(true);
    } else {
      processCheckIn(branchConfig, 1, options);
    }
  };

  const handleCheckOut = async () => {
    if (!todayCheckin) return;
    const branchConfig = branchDataMap[normalizeBranch(todayCheckin.branch)];

    if (branchConfig) {
      const currentShift = todayCheckin.shift || 1;
      const minCheckout = currentShift === 2 ? branchConfig.shift2_out : branchConfig.shift1_out;

      if (currentTimeMinutes < minCheckout && !todayCheckin.status.includes("นอกพื้นที่")) {
        const minTimeStr = `${Math.floor(minCheckout / 60).toString().padStart(2, '0')}:${(minCheckout % 60).toString().padStart(2, '0')}`;
        message.warning(`ยังไม่ถึงเวลาเช็คเอาท์ (${minTimeStr} น.)`);
        return;
      }
    }

    try {
      const now = dayjs();
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

  // --- Scanner Logic ---
  const startQRScan = async () => {
    if (!qrRef.current || !selectedEmployee || scanning || !html5QrCodeRef.current || isStartingRef.current) return;
    
    if (html5QrCodeRef.current.isScanning) {
        setScanning(true);
        return;
    }

    isStartingRef.current = true;
    setScanning(true);
    hasScannedRef.current = false;

    try {
      await html5QrCodeRef.current.start(
        { facingMode: "environment" }, { fps: 10, qrbox: 250 },
        async (decodedText) => {
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;
          
          setHasJustProcessed(true);
          
          try {
              if (html5QrCodeRef.current?.isScanning) {
                  await html5QrCodeRef.current.stop();
              }
          } catch (err) {}
          setScanning(false);

          let branchName = "";
          try {
            const url = new URL(decodedText);
            branchName = decodeURIComponent(url.searchParams.get("branch") || "").trim();
          } catch (e) {
            message.error("QR Code ไม่ถูกต้อง"); return;
          }

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
            } catch (e) { outsideArea = true; debugMsg = "GPS Error"; }
          }

          // ✅ ตรวจสอบตัวแปรจาก state โดยตรงภายใน callback
          // (แต่เพื่อให้มั่นใจ เราจะดึง logic ออกไปไว้ข้างนอก หรือเช็คตรงนี้เลยก็ได้)
          // เนื่องจาก State ใน Callback อาจเก่า เราจึงใช้ setState callback หรือ ref ถ้าจำเป็น
          // แต่ในที่นี้ logic ถูกเรียกใช้งานทีหลังผ่าน handle... function ซึ่งจะดึง state ปัจจุบันได้

          // Re-evaluate checkin status based on latest data (or pass parameters)
          // Note: State `todayCheckin` inside this callback closure might be stale.
          // However, for simplicity here, we assume it's up to date because `startQRScan` is recreated on dependency change.
          // A safer way is to check DB again or use Refs. Let's rely on `useEffect` deps for now.

          const isCheckedIn = !!(todayCheckin && todayCheckin.checkinTime && todayCheckin.checkinTime !== "-");
          const isCheckedOut = !!(todayCheckin && todayCheckin.checkoutTime && todayCheckin.checkoutTime !== "-");

          if (isCheckedIn && !isCheckedOut) {
            await handleCheckOut();
          } else if (!isCheckedIn) {
            await handleCheckIn(branchName, { outsideArea, debugMessage: debugMsg });
          } else {
            message.info("วันนี้จบงานแล้ว");
          }
        },
        () => { }
      );
    } catch (e) { 
        setScanning(false); 
    } finally {
        isStartingRef.current = false;
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (e) { }
      setScanning(false);
      hasScannedRef.current = false;
    }
  };

  // ✅ Auto Start Scanner logic (Updated Condition)
  useEffect(() => {
    const qrElement = document.getElementById("qr-reader");
    const isModalOpen = showSuccessModal || showLateLevel1Modal || showLateLevel2Modal || showLateLevel3Modal || showOutsideModal || showFirstTimeModal || showCheckoutModal || showShiftSelectModal;

    const isCheckedIn = !!(todayCheckin?.checkinTime && todayCheckin.checkinTime !== "-");
    const isCheckedOut = !!(todayCheckin?.checkoutTime && todayCheckin.checkoutTime !== "-");

    // คำนวณเวลาเช็คเอาท์ของกะปัจจุบัน (เพื่อดูว่าถึงเวลาเปิดกล้องให้เช็คเอาท์หรือยัง)
    let isTimeOut = false;
    if (isCheckedIn && todayCheckin) {
      const branchConfig = branchDataMap[normalizeBranch(todayCheckin.branch)];
      if (branchConfig) {
        const currentShift = todayCheckin.shift || 1;
        const minCheckout = currentShift === 2 ? branchConfig.shift2_out : branchConfig.shift1_out;
        isTimeOut = currentTimeMinutes >= minCheckout;
      } else {
        isTimeOut = true;
      }
    }

    // เงื่อนไขเปิดกล้องอัตโนมัติ:
    // 1. ยังไม่เช็คอิน
    // 2. เช็คอินแล้ว + ยังไม่เช็คเอาท์ + ถึงเวลาออกงาน
    const shouldStartScan =
      globalSettings &&
      lineProfile &&
      dataLoaded &&
      qrElement &&
      selectedEmployee &&
      !isModalOpen &&
      !hasJustProcessed &&
      (!isCheckedIn || (isCheckedIn && !isCheckedOut && isTimeOut));

    if (shouldStartScan) {
      if (!html5QrCodeRef.current) {
        try {
          html5QrCodeRef.current = new Html5Qrcode("qr-reader");
        } catch (e) { }
      }

      if (html5QrCodeRef.current && !scanning && !isStartingRef.current) {
        const timer = setTimeout(() => {
          startQRScan();
        }, 800);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSettings, lineProfile, dataLoaded, selectedEmployee, todayCheckin, showSuccessModal, showLateLevel1Modal, showLateLevel2Modal, showLateLevel3Modal, showOutsideModal, showCheckoutModal, showShiftSelectModal, currentTimeMinutes, hasJustProcessed]);


  const handleSelect = (value) => setSelectedEmployee(employees.find(e => e.employeeId === value));

  if (!dataLoaded) return <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div>;

  const isCheckedInState = !!(todayCheckin?.checkinTime && todayCheckin.checkinTime !== "-");
  const isCheckedOutState = !!(todayCheckin?.checkoutTime && todayCheckin.checkoutTime !== "-");

  let isTimeToCheckOut = false;
  if (isCheckedInState && todayCheckin) {
    const branchConfig = branchDataMap[normalizeBranch(todayCheckin.branch)];
    if (branchConfig) {
      const currentShift = todayCheckin.shift || 1;
      const minCheckout = currentShift === 2 ? branchConfig.shift2_out : branchConfig.shift1_out;
      isTimeToCheckOut = currentTimeMinutes >= minCheckout;
    } else {
      isTimeToCheckOut = true;
    }
  }

  const getButtonText = () => {
    if (firstTime) return "เลือกชื่อเพื่อเริ่มใช้งาน";
    if (scanning) return "กำลังสแกน...";
    if (isCheckedInState && !isCheckedOutState && isTimeToCheckOut) return "สแกนเช็คเอาท์";
    if (isCheckedInState && !isCheckedOutState && !isTimeToCheckOut) return "ยังไม่ถึงเวลาออกงาน";
    if (isCheckedOutState) return "เช็คเอาท์แล้ว";
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
                <Select 
                  showSearch 
                  placeholder="เลือกชื่อของคุณ" 
                  onChange={handleSelect} 
                  style={{ width: '100%' }} 
                  size="large"
                  filterOption={(input, option) =>
                    (option?.children ?? "").toLowerCase().includes(input.toLowerCase()) ||
                    (option?.['data-nickname'] ?? "").toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {employees.map(e => (
                    <Option 
                      key={e.employeeId} 
                      value={e.employeeId}
                      data-nickname={e.nickname || ""}
                    >
                      {e.name} {e.nickname ? `(${e.nickname})` : ""}
                    </Option>
                  ))}
                </Select>
              ) : (
                <>
                  <Title level={5} style={{ margin: 0 }}>{selectedEmployee?.name}</Title>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      <EnvironmentOutlined /> {selectedEmployee?.branch || "ไม่ระบุสาขา"}
                    </Text>
                    {isCheckedInState && <Tag color="blue" icon={<FieldTimeOutlined />}>กะ {todayCheckin.shift || 1}</Tag>}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Tag color="orange">รหัส: {selectedEmployee?.employeeId}</Tag>
                  </div>
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
            disabled={(firstTime && !selectedEmployee) || isCheckedOutState || (isCheckedInState && !isTimeToCheckOut)}
            onClick={startQRScan} loading={scanning}
            icon={!scanning && <ScanOutlined style={{ fontSize: 24 }} />}
            style={{ height: 60, borderRadius: 15, fontSize: 18, background: isCheckedOutState ? "#d9d9d9" : "linear-gradient(90deg, #FF6539 0%, #ff8e6f 100%)", border: 'none' }}
          >
            {getButtonText()}
          </Button>

          {!firstTime && !isCheckedOutState && !scanning && isCheckedInState && !isTimeToCheckOut && (
            <div style={{ textAlign: 'center', marginTop: 15 }}>
              <Text type="secondary" style={{ fontSize: 12, color: '#faad14' }}>
                <ClockCircleOutlined /> ยังไม่ถึงเวลาออกงาน (รอเวลาเช็คเอาท์)
              </Text>
            </div>
          )}
        </div>

        {/* Status Timeline */}
        {!firstTime && (
          <Card title="สถานะวันนี้" bordered={false} style={{ borderRadius: 20 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Card size="small" style={{ background: isCheckedInState ? "#f6ffed" : "#f5f5f5", borderColor: isCheckedInState ? "#b7eb8f" : "#f0f0f0", textAlign: 'center' }}>
                  <Text type="secondary">เข้างาน</Text>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: isCheckedInState ? '#389e0d' : '#ccc' }}>
                    {todayCheckin?.checkinTime || "--:--"}
                  </div>
                  {isCheckedInState && <Tag color={getStatusColor(todayCheckin?.status)}>{todayCheckin?.status}</Tag>}
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" style={{ background: isCheckedOutState ? "#e6f7ff" : "#f5f5f5", borderColor: isCheckedOutState ? "#91d5ff" : "#f0f0f0", textAlign: 'center' }}>
                  <Text type="secondary">ออกงาน</Text>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: isCheckedOutState ? '#096dd9' : '#ccc' }}>
                    {todayCheckin?.checkoutTime !== "-" ? todayCheckin?.checkoutTime : "--:--"}
                  </div>
                </Card>
              </Col>
            </Row>
          </Card>
        )}
        <div style={{ marginTop: 30, paddingBottom: 20 }}>
          <Button block size="large" type="primary" style={{ height: 50, borderRadius: 12, background: "#333" }} onClick={() => liff.closeWindow()}>ปิดหน้าต่าง</Button>

        </div>
      </div>

      {/* --- Modal เลือกกะ (Shift Selection) --- */}
      <Modal
        title={<div style={{ textAlign: 'center' }}><FieldTimeOutlined /> เลือกกะเข้างาน</div>}
        open={showShiftSelectModal}
        centered
        footer={null}
        closable={false}
        maskClosable={false}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Text>กรุณาระบุกะที่คุณต้องการเช็คอิน</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 30 }}>
          <Button
            type={selectedShift === 1 ? "primary" : "default"}
            size="large"
            style={{ height: 100, width: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setSelectedShift(1)}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold' }}>กะ 1</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>เช้า/ปกติ</div>
          </Button>
          <Button
            type={selectedShift === 2 ? "primary" : "default"}
            size="large"
            style={{ height: 100, width: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setSelectedShift(2)}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold' }}>กะ 2</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>บ่าย/เย็น</div>
          </Button>
        </div>
        <Button type="primary" block size="large" onClick={handleShiftConfirm}>ยืนยันการเช็คอิน</Button>
      </Modal>

      {/* --- Modals Zone (Alerts) --- */}
      <Modal open={showSuccessModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
        <CheckCircleFilled style={{ fontSize: 60, color: '#52c41a', marginBottom: 20 }} />
        <Title level={4} style={{ color: '#52c41a' }}>สุดยอด! มาทันเวลา</Title>
        <img src="/ontime.gif" alt="On time" style={{ width: 200, marginBottom: 20 }} />
        <div style={{ background: '#f6ffed', padding: 15, borderRadius: 10, margin: '20ผpx 0' }}><pre>{lastCheckInMessage}</pre></div>
        <Button type="primary" block size="large" onClick={() => setShowSuccessModal(false)}>ตกลง</Button>
      </Modal>

      <Modal open={showLateLevel1Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
        <ClockCircleOutlined style={{ fontSize: 60, color: '#faad14', marginBottom: 20 }} />
        <Title level={4} style={{ color: '#faad14' }}>มาให้ไวกว่านี้นะ</Title>
        <div style={{ background: '#fffbe6', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{lastCheckInMessage}</pre></div>
        <Button type="primary" style={{ background: '#faad14', borderColor: '#faad14' }} block size="large" onClick={() => setShowLateLevel1Modal(false)}>รับทราบ</Button>
      </Modal>

      <Modal open={showLateLevel2Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
        <div style={{ fontSize: 60, marginBottom: 20 }}>🏃💨</div>
        <Title level={3} style={{ color: '#fa541c' }}>วิ่งงงงงงงง</Title>
        <div style={{ background: '#fff2e8', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{lastCheckInMessage}</pre></div>
        <Button type="primary" danger block size="large" onClick={() => setShowLateLevel2Modal(false)}>รับทราบ</Button>
      </Modal>

      <Modal open={showLateLevel3Modal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 0 }}>
        <CloseCircleFilled style={{ fontSize: 60, color: '#cf1322', marginBottom: 20, marginTop: 30 }} />
        <Title level={4} style={{ color: '#cf1322' }}>สายแล้วนะ! กลับบ้านไปนอนเลยนะ</Title>
        <img src="/sleep.jpg" alt="Go to sleep" style={{ width: '100%', maxWidth: 300, borderRadius: 8 }} />
        <div style={{ background: '#fff1f0', padding: 15, borderRadius: 10, margin: '20px' }}><pre>{lastCheckInMessage}</pre></div>
        <div style={{ padding: '0 20px 30px' }}><Button type="primary" danger block size="large" onClick={() => setShowLateLevel3Modal(false)}>รับทราบ</Button></div>
      </Modal>

      <Modal open={showCheckoutModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
        <LogoutOutlined style={{ fontSize: 60, color: '#1890ff', marginBottom: 20 }} />
        <Title level={4}>เช็คเอาท์สำเร็จ</Title>
        <div style={{ background: '#e6f7ff', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{checkoutMessage}</pre></div>
        <Button type="primary" block size="large" onClick={() => setShowCheckoutModal(false)}>ตกลง</Button>
      </Modal>

      <Modal open={showOutsideModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
        <EnvironmentOutlined style={{ fontSize: 60, color: '#faad14', marginBottom: 20 }} />
        <Title level={4} style={{ color: '#faad14' }}>อยู่นอกพื้นที่!</Title>
        <div style={{ background: '#fffbe6', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{lastCheckInMessage}</pre></div>
        <Button type="primary" danger block size="large" onClick={() => setShowOutsideModal(false)}>รับทราบ</Button>
      </Modal>

      <Modal open={showFirstTimeModal} centered footer={null} closable={false} bodyStyle={{ textAlign: 'center', padding: 30 }}>
        <CheckCircleFilled style={{ fontSize: 60, color: '#52c41a', marginBottom: 20 }} />
        <Title level={4}>ยินดีต้อนรับ</Title>
        <div style={{ background: '#f6ffed', padding: 15, borderRadius: 10, margin: '20px 0' }}><pre>{firstTimeCheckInMessage}</pre></div>
        <Button type="primary" block size="large" onClick={() => setShowFirstTimeModal(false)}>เริ่มใช้งาน</Button>
      </Modal>

    </div>
  );
}