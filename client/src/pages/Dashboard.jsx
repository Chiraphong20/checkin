import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Table,
  Card,
  Spin,
  message,
  Row,
  Col,
  Statistic,
  Select,
  Tag,
  Button,
  Modal,
  Alert,
  Typography,
  theme
} from "antd";
import { 
    UserOutlined, 
    CheckCircleOutlined, 
    CloseCircleOutlined, 
    CarOutlined, 
    CoffeeOutlined, 
    SaveOutlined, 
    ExclamationCircleOutlined,
    ClockCircleOutlined
} from "@ant-design/icons";
import { db } from "../firebase"; // ตรวจสอบว่า path นี้ถูกต้องในโปรเจคของคุณ
import { collection, getDocs, addDoc, doc, getDoc } from "firebase/firestore";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import "dayjs/locale/th";

dayjs.locale("th");
dayjs.extend(isBetween);

// ✅ ประกาศตัวแปรหลังจาก Import เสร็จสิ้น
const { Title, Text } = Typography; 

const Dashboard = () => {
  // --- State เดิม ---
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("ทั้งหมด");
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("today");

  // --- State สำหรับระบบตัดยอด (Auto-Cutoff) ---
  const [processing, setProcessing] = useState(false);
  const [fineAmount, setFineAmount] = useState(50);
  const [cutoffTimeStr, setCutoffTimeStr] = useState("17:00"); 
  const [isCutoffDone, setIsCutoffDone] = useState(false);
  
  // ✅ แก้ไข: เพิ่มเวลาเริ่มต้น
  const [todayString, setTodayString] = useState(dayjs().format("D MMMM YYYY เวลา HH:mm น."));

  // ✅ State สำหรับ Filter จาก Card
  const [filterType, setFilterType] = useState(null); // null = แสดงทั้งหมด, 'total', 'checkin', 'late', 'absent', 'outside', 'checkout'

  // ✅ ใช้ Hook useModal เพื่อให้ Modal ทำงานสมบูรณ์ใน React รุ่นใหม่
  const [modal, contextHolder] = Modal.useModal();

  // ใช้ Token เพื่อดึงสี Theme (ถ้าต้องการ)
  const { token } = theme.useToken();

  // ✅ เพิ่ม useEffect สำหรับอัปเดตเวลา Real-time
  useEffect(() => {
    const timer = setInterval(() => {
      setTodayString(dayjs().format("D MMMM YYYY เวลา HH:mm น."));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------
  // 🔹 โหลดข้อมูลทั้งหมด
  // ---------------------------------------------------------
  const fetchAllData = useCallback(async () => {
      try {
        // 1. ดึงค่า Config
        try {
            const settingsSnap = await getDoc(doc(db, "settings", "checkin"));
            if (settingsSnap.exists()) {
                const sData = settingsSnap.data();
                setFineAmount(sData.absentFine || 50);
                if (sData.checkoutTime) {
                    setCutoffTimeStr(sData.checkoutTime);
                }
            }
        } catch (e) { console.log("Using default settings"); }

        // 2. ดึงข้อมูลหลัก
        const branchSnap = await getDocs(collection(db, "branches"));
        setBranches(branchSnap.docs.map((doc) => ({ id: doc.id, name: doc.data().name })));

        const empSnap = await getDocs(collection(db, "employees"));
        setEmployees(empSnap.docs.map((doc) => doc.data()));

        const checkinSnap = await getDocs(collection(db, "employee_checkin"));
        setCheckins(checkinSnap.docs.map((doc) => doc.data()));

        const leaveSnap = await getDocs(collection(db, "employee_leave"));
        setLeaves(leaveSnap.docs.map((doc) => doc.data()));

      } catch (err) {
        console.error(err);
        message.error("โหลดข้อมูลล้มเหลว");
      } finally {
        setLoading(false);
      }
  }, []);

  // Initial Load & Auto Refresh
  useEffect(() => {
    setLoading(true);
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000); // รีเฟรชทุก 1 นาที
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // ---------------------------------------------------------
  // 🔹 คำนวณรายชื่อคนขาดงาน (สำหรับวันนี้เท่านั้น)
  // ---------------------------------------------------------
  const absentEmployeesList = useMemo(() => {
     const todayStr = dayjs().format("YYYY-MM-DD");
     // หาคนที่ "ไม่มีเช็คอินวันนี้" และ "ไม่มีใบลาวันนี้"
     const missing = employees.filter(emp => {
         const hasCheckin = checkins.find(c => c.employeeId === emp.employeeId && c.date === todayStr);
         const hasLeave = leaves.find(l => l.employeeId === emp.employeeId && l.date === todayStr);
         return !hasCheckin && !hasLeave;
     }).map(emp => ({
         ...emp,
         status: 'รอตัดยอดขาดงาน'
     }));
     return missing;
  }, [employees, checkins, leaves]);

  // ตรวจสอบว่าวันนี้ตัดยอดไปหรือยัง
  useEffect(() => {
      const todayStr = dayjs().format("YYYY-MM-DD");
      const hasAutoRecord = checkins.some(c => c.date === todayStr && c.isAutoAbsent === true);
      setIsCutoffDone(hasAutoRecord || absentEmployeesList.length === 0);
  }, [checkins, absentEmployeesList]);

  // ---------------------------------------------------------
  // 🔹 Auto Cutoff Logic
  // ---------------------------------------------------------
  useEffect(() => {
    if (loading) return;

    const checkAutoProcess = () => {
        const now = dayjs();
        const [cutoffHour, cutoffMinute] = cutoffTimeStr.split(':').map(Number);
        const cutoffTimeDate = dayjs().hour(cutoffHour).minute(cutoffMinute).second(0);

        if (now.isAfter(cutoffTimeDate) && absentEmployeesList.length > 0 && !isCutoffDone && !processing) {
            console.log(`⚡ Auto-processing Absences... Time: ${now.format('HH:mm')}`);
            handleProcessAbsence(true); 
        }
    };

    const timer = setInterval(checkAutoProcess, 60000); 
    checkAutoProcess(); 

    return () => clearInterval(timer);
  }, [loading, absentEmployeesList, isCutoffDone, processing, cutoffTimeStr]);

  // ---------------------------------------------------------
  // 🔹 ฟังก์ชันบันทึกข้อมูลขาดงาน
  // ---------------------------------------------------------
  const handleProcessAbsence = (isAuto = false) => {
    if (absentEmployeesList.length === 0) return;

    const executeSave = async () => {
        setProcessing(true);
        try {
            const todayStr = dayjs().format("YYYY-MM-DD");
            const timestampStr = dayjs().format("YYYY-MM-DD HH:mm:ss");
            
            const promises = absentEmployeesList.map(emp => {
                return addDoc(collection(db, "employee_checkin"), {
                    employeeId: emp.employeeId,
                    name: emp.name,
                    department: emp.department || "",
                    branch: emp.branch || "",
                    date: todayStr,
                    checkinTime: "-", 
                    checkoutTime: "-",
                    timestamp: timestampStr,
                    status: "ขาดงาน", 
                    fine: fineAmount, 
                    isAutoAbsent: true 
                });
            });

            await Promise.all(promises);
            message.success(isAuto ? `ตัดยอดอัตโนมัติเรียบร้อย (${absentEmployeesList.length} คน)` : `บันทึกสำเร็จ`);
            fetchAllData(); 
        } catch (err) {
            console.error(err);
            message.error("บันทึกไม่สำเร็จ");
        } finally {
            setProcessing(false);
        }
    };

    if (isAuto) {
        executeSave();
    } else {
        modal.confirm({
            title: `ยืนยันการตัดยอดสิ้นวัน?`,
            icon: <ExclamationCircleOutlined />,
            content: `ระบบจะบันทึกสถานะ "ขาดงาน" ให้กับพนักงาน ${absentEmployeesList.length} คน และคิดค่าปรับคนละ ${fineAmount} บาท`,
            okText: "ยืนยัน",
            cancelText: "ยกเลิก",
            onOk: executeSave,
        });
    }
  };

  // ---------------------------------------------------------
  // 🔹 Logic การ Filter ข้อมูลสำหรับ Table
  // ---------------------------------------------------------
  const branchOptions = useMemo(
    () => [
      { value: "ทั้งหมด", label: "ทั้งหมด" },
      ...branches.map((b) => ({ value: b.name, label: b.name })),
    ],
    [branches]
  );

  const branchEmployees = useMemo(
    () =>
      selectedBranch === "ทั้งหมด"
        ? employees
        : employees.filter((e) => {
            const branches = Array.isArray(e.branches)
              ? e.branches
              : e.branch
              ? [e.branch]
              : [];
            return branches.includes(selectedBranch);
          }),
    [employees, selectedBranch]
  );

  const branchEmployeeIds = useMemo(
    () => new Set(branchEmployees.map((e) => e.employeeId)),
    [branchEmployees]
  );

  const mergedCheckins = useMemo(() => {
    const leaveRecords = leaves.map((l) => {
      const emp = employees.find(e => e.employeeId === l.employeeId);
      const typeText = l.type || l.leaveType || "";
      const statusText = typeText ? `ลา (${typeText})` : "ลา";

      return {
        employeeId: l.employeeId,
        name: emp?.name || "ไม่ทราบชื่อ",
        branch: emp?.branch || (Array.isArray(emp?.branches) ? emp.branches[0] : "-"),
        date: l.date,
        checkinTime: "-",
        checkoutTime: "-",
        status: statusText,
        fine: 0,
        __isLeave: true,
      };
    });

    return [...checkins, ...leaveRecords];
  }, [checkins, leaves, employees]);

  const processedCheckins = useMemo(() => {
    const today = dayjs();

    let data =
      selectedBranch === "ทั้งหมด"
        ? mergedCheckins
        : mergedCheckins.filter((c) => branchEmployeeIds.has(c.employeeId));

    return data
      .filter((item) => {
        const itemDate = dayjs(item.date, "YYYY-MM-DD");

        if (selectedRange === "today") {
          return itemDate.isSame(today, "day");
        }
        if (selectedRange === "7days") {
          return (
            itemDate.isAfter(today.subtract(7, "day")) ||
            itemDate.isSame(today, "day")
          );
        }
        if (selectedRange === "month") {
          return itemDate.isSame(today, "month");
        }
        return true;
      })
      .map((item) => {
        const emp = employees.find((e) => e.employeeId === item.employeeId);
        let status = item.status;

        // นอกพื้นที่
        if (!item.__isLeave && emp) {
          const empBranches = Array.isArray(emp.branches)
            ? emp.branches
            : emp.branch
            ? [emp.branch]
            : [];
          if (
            item.branch &&
            empBranches.length > 0 &&
            !empBranches.includes(item.branch)
          ) {
            status = "นอกพื้นที่";
          }
        }
        return { ...item, status };
      });
  }, [mergedCheckins, branchEmployeeIds, selectedBranch, selectedRange, employees]);

  const todayData = useMemo(() => {
    if (selectedRange !== "today") return [];

    const map = new Map();

    processedCheckins.forEach((item) => {
      const key = `${item.employeeId}_${item.date}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, item);
      } else {
        const existingTime = existing.checkinTime || "00:00";
        const newTime = item.checkinTime || "00:00";

        if (newTime >= existingTime) map.set(key, item);
        if (existing.__isLeave && !item.__isLeave) map.set(key, item);
      }
    });

    return Array.from(map.values());
  }, [processedCheckins, selectedRange]);

const groupedRangeData = useMemo(() => {
    if (selectedRange === "today") return [];

    const map = new Map();

    processedCheckins.forEach((item) => {
      if (!map.has(item.employeeId)) {
        const emp = employees.find((e) => e.employeeId === item.employeeId);

        map.set(item.employeeId, {
          employeeId: item.employeeId,
          name: item.name || emp?.name || "-",
          branch: item.branch || emp?.branch || "-",
          history: [],
          // ✅ เพิ่ม leave เข้าไปใน summary
          summary: { late: 0, absent: 0, leave: 0, outside: 0, fine: 0 },
        });
      }

      const rec = map.get(item.employeeId);
      rec.history.push(item);

      if (item.status?.includes("สาย")) rec.summary.late += 1;
      
      // ✅ แยก Logic: ถ้าลา/หยุด ให้เพิ่ม leave, ถ้าขาดงาน ให้เพิ่ม absent
      if (item.status?.includes("หยุด") || item.status?.includes("ลา")) {
        rec.summary.leave += 1;
      }
      
      if (item.status === "นอกพื้นที่") rec.summary.outside += 1;
      
      if (item.status === "ขาดงาน") { 
          rec.summary.absent += 1; 
          rec.summary.fine += parseInt(item.fine) || 0;
      } else {
          rec.summary.fine += parseInt(item.fine) || 0;
      }
    });

    map.forEach((v) => {
      v.history.sort((a, b) => dayjs(b.date).diff(dayjs(a.date)));
    });

    return Array.from(map.values());
  }, [processedCheckins, selectedRange, employees]);
  // ---------------------------------------------------------
  // ✅ Logic กรองข้อมูลตาม Card ที่เลือก (Filter Logic)
  // ---------------------------------------------------------
 const filteredDataSource = useMemo(() => {
    // 1. เลือก Source Data ตาม Range
    let data = selectedRange === "today" ? todayData : groupedRangeData;

    // 2. ถ้าไม่ได้เลือก Filter อะไรเลย ให้คืนค่าข้อมูลทั้งหมด
    if (!filterType || filterType === 'total') return data;

    // 3. กรองตามประเภท
    return data.filter(item => {
        if (selectedRange === "today") {
            // ... (Logic เดิมของ today ไม่ต้องแก้) ...
            if (filterType === 'checkin') return item.checkinTime !== "-";
            if (filterType === 'checkout') return item.checkoutTime !== "-";
            if (filterType === 'late') return item.status?.includes("สาย");
            if (filterType === 'absent') return item.status?.includes("ลา") || item.status?.includes("หยุด") || item.status === "ขาดงาน";
            if (filterType === 'outside') return item.status === "นอกพื้นที่";
        } else {
            // --- กรณีดูแบบช่วงเวลา (Item คือ พนักงานที่ Group แล้ว) ---
            if (filterType === 'checkin') return item.history.some(h => h.checkinTime !== "-");
            if (filterType === 'checkout') return item.history.some(h => h.checkoutTime !== "-");
            if (filterType === 'late') return item.summary.late > 0;
            // ✅ แก้ไข: เช็คทั้ง absent และ leave
            if (filterType === 'absent') return item.summary.absent > 0 || item.summary.leave > 0;
            if (filterType === 'outside') return item.summary.outside > 0;
        }
        return true;
    });
  }, [todayData, groupedRangeData, filterType, selectedRange]);
const summaryStats = useMemo(() => {
    let late = 0,
      absent = 0,
      outside = 0,
      checkinsCount = 0,
      checkoutsCount = 0;

    if (selectedRange === "today") {
      todayData.forEach((d) => {
        if (d.checkinTime !== "-") checkinsCount++;
        if (d.checkoutTime !== "-") checkoutsCount++;
        if (d.status?.includes("สาย")) late++;
        // รวมลาและขาดใน Card เดียวกัน (หรือจะแยกก็ได้ตามต้องการ)
        if (d.status?.includes("หยุด") || d.status?.includes("ลา")) absent++;
        if (d.status === "ขาดงาน") absent++; 
        if (d.status === "นอกพื้นที่") outside++;
      });
    } else {
      groupedRangeData.forEach((d) => {
        late += d.summary.late;
        // ✅ เอาทั้งขาดและลามารวมกันเพื่อโชว์ใน Card "ขาด/ลา" (จะได้ไม่พัง)
        absent += (d.summary.absent + d.summary.leave); 
        outside += d.summary.outside;
        checkinsCount += d.history.filter((h) => h.checkinTime !== "-").length;
      });
    }

    return {
      totalEmployees: employees.length,
      todayCheckins: checkinsCount,
      todayCheckouts: checkoutsCount,
      late,
      absent,
      outside,
    };
  }, [todayData, groupedRangeData, selectedRange, employees.length]);
  // ฟังก์ชัน Handle Click Card
  const handleCardClick = (type) => {
      // ถ้ากดซ้ำให้ยกเลิก Filter, ถ้ากดใหม่ให้เลือก Filter นั้น
      setFilterType(prev => prev === type ? null : type);
  };

  // Helper สำหรับสร้าง Style ของ Card เมื่อถูกเลือก
  const getCardStyle = (type, bgColor) => {
      const isSelected = filterType === type;
      return {
          background: bgColor,
          cursor: "pointer",
          transition: "all 0.3s",
          border: isSelected ? "2px solid #ff6b35" : "1px solid #f0f0f0", // ไฮไลท์สีส้มเมื่อเลือก
          transform: isSelected ? "scale(1.02)" : "scale(1)",
          boxShadow: isSelected ? "0 4px 12px rgba(255, 107, 53, 0.2)" : "none"
      };
  };

  const todayColumns = [
    { title: "รหัส", dataIndex: "employeeId", width: 100 },
    { title: "ชื่อ - สกุล", dataIndex: "name", width: 180 },
    { title: "สาขา", dataIndex: "branch", width: 150 },
    {
      title: "เวลาเช็คอิน",
      dataIndex: "checkinTime",
      width: 110,
    },
    {
      title: "เวลาเช็คเอาท์",
      dataIndex: "checkoutTime",
      width: 110,
    },
    {
      title: "สถานะ",
      dataIndex: "status",
      width: 160,
      render: (text) => {
        let color = "green";
        if (text?.includes("สาย")) color = "orange";
        if (text?.includes("ลา") || text?.includes("หยุด") || text?.includes("ขาดงาน")) color = "red";
        if (text?.includes("นอกพื้นที่")) color = "purple";
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: "ค่าปรับ",
      dataIndex: "fine",
      width: 80,
      render: (f) => (f > 0 ? `${f}` : "-"),
    },
  ];

 const rangeColumns = [
    { title: "รหัส", dataIndex: "employeeId", width: 100 },
    { title: "ชื่อ - สกุล", dataIndex: "name", width: 200 },
    {
      title: "มาสาย",
      dataIndex: ["summary", "late"],
      align: "center",
      render: (v) => (v > 0 ? <b style={{ color: "orange" }}>{v}</b> : "-"),
    },
    // ✅ เพิ่มคอลัมน์ "ขาดงาน" (สีแดง)
    {
      title: "ขาดงาน",
      dataIndex: ["summary", "absent"],
      align: "center",
      render: (v) => (v > 0 ? <b style={{ color: "red" }}>{v}</b> : "-"),
    },
    // ✅ เพิ่มคอลัมน์ "ลางาน" (สีฟ้า หรือ น้ำเงิน)
    {
      title: "ลางาน",
      dataIndex: ["summary", "leave"],
      align: "center",
      render: (v) => (v > 0 ? <b style={{ color: "#1890ff" }}>{v}</b> : "-"),
    },
    {
      title: "นอกพื้นที่",
      dataIndex: ["summary", "outside"],
      align: "center",
      render: (v) => (v > 0 ? <b style={{ color: "purple" }}>{v}</b> : "-"),
    },
    {
      title: "ค่าปรับรวม",
      dataIndex: ["summary", "fine"],
      align: "right",
      render: (v) => (v > 0 ? <span style={{ color: "red" }}>{v} บาท</span> : "-"),
    },
  ];

  const expandedRowRender = (record) => {
    const cols = [
      {
        title: "วันที่",
        dataIndex: "date",
        render: (d) => dayjs(d).format("DD/MM/YYYY"),
      },
      { title: "เวลาเข้า", dataIndex: "checkinTime" },
      { title: "เวลาออก", dataIndex: "checkoutTime" },
      { title: "สาขา", dataIndex: "branch" },
      {
        title: "สถานะ",
        dataIndex: "status",
        render: (text) => {
          let color = "green";
          if (text?.includes("สาย")) color = "orange";
          if (text?.includes("ลา") || text?.includes("ขาดงาน")) color = "red";
          if (text?.includes("นอกพื้นที่")) color = "purple";
          return <Tag color={color}>{text}</Tag>;
        },
      },
      {
        title: "ค่าปรับ",
        dataIndex: "fine",
        render: (v) => (v > 0 ? <span style={{ color: "red" }}>{v}</span> : "-"),
      },
    ];

    return (
      <Table
        columns={cols}
        dataSource={record.history}
        size="small"
        pagination={false}
        rowKey={(r) =>
          `${r.employeeId}_${r.date}_${r.checkinTime}_${r.__isLeave ? "leave" : "in"}`
        }
      />
    );
  };

  return (
    <div style={{ padding: "0" }}>
      {/* ✅ วาง contextHolder ไว้ใน JSX เพื่อให้ Modal แสดงผลได้ */}
      {contextHolder}

      {loading && (
        <Spin
          size="large"
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 20,
          }}
        />
      )}

    
 <Card
        styles={{ body: { padding: '0' } }} // ✅ แก้ไข bodyStyle เป็น styles.body
        style={{
          borderRadius: 12,
          marginBottom: 20,
          background: "#fff",
        }}
        
      >
        <div>
           {dayjs().format("HH:mm") > cutoffTimeStr && isCutoffDone && (
          <Alert message="ระบบได้ทำการตัดยอดขาดงานประจำวันเรียบร้อยแล้ว" type="success" showIcon style={{ marginBottom: 0 }} />
      )}
      {dayjs().format("HH:mm") <= cutoffTimeStr && (
          <Alert message={`ระบบจะตัดยอดขาดงานอัตโนมัติหลังเวลา ${cutoffTimeStr} น.`} type="info" showIcon icon={<ClockCircleOutlined />} style={{ marginBottom: 0 }} />
      )}
        </div>
      </Card>
    

      {/* Summary Cards */}
      <Card
        styles={{ body: { padding: '20px' } }} // ✅ แก้ไข bodyStyle เป็น styles.body
        style={{
          borderRadius: 12,
          marginBottom: 20,
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Select
            value={selectedRange}
            onChange={setSelectedRange}
            options={[
              { label: "วันนี้", value: "today" },
              { label: "7 วันล่าสุด", value: "7days" },
              { label: "เดือนนี้", value: "month" },
            ]}
            style={{ width: 150 }}
            size="large"
          />
        
     
      
       
           {filterType && (
              <Button type="link" onClick={() => setFilterType(null)} danger>
                  ล้างตัวกรอง ({filterType === 'total' ? 'พนักงานทั้งหมด' : 
                                filterType === 'checkin' ? 'เช็คอิน' :
                                filterType === 'late' ? 'มาสาย' :
                                filterType === 'absent' ? 'ขาด/ลา' :
                                filterType === 'outside' ? 'นอกพื้นที่' : 'เช็คเอาท์'})
              </Button>
          )}
        </div>

        <Row gutter={[16, 16]} style={{ marginTop: 15 }}>
          
          <Col xs={12} sm={8} md={4}>
            <Card 
                style={getCardStyle('total', "#FFE2E5")} 
                styles={{ body: { padding: 15 } }}
                onClick={() => handleCardClick('total')}
            >
              <Statistic title="พนักงานทั้งหมด" value={summaryStats.totalEmployees} />
            </Card>
          </Col>

          <Col xs={12} sm={8} md={4}>
            <Card 
                style={getCardStyle('checkin', "#FFF4DE")} 
                styles={{ body: { padding: 15 } }}
                onClick={() => handleCardClick('checkin')}
            >
              <Statistic
                title={selectedRange === "today" ? "เช็คอินวันนี้" : "จำนวนครั้งเช็คอิน"}
                value={summaryStats.todayCheckins}
              />
            </Card>
          </Col>

          <Col xs={12} sm={8} md={4}>
            <Card 
                style={getCardStyle('late', "#DCFCE7")} 
                styles={{ body: { padding: 15 } }}
                onClick={() => handleCardClick('late')}
            >
              <Statistic title="มาสาย" value={summaryStats.late} />
            </Card>
          </Col>

          <Col xs={12} sm={8} md={4}>
            <Card 
                style={getCardStyle('absent', "#F3E8FF")} 
                styles={{ body: { padding: 15 } }}
                onClick={() => handleCardClick('absent')}
            >
              <Statistic title="ขาด/ลา" value={summaryStats.absent} />
            </Card>
          </Col>

          <Col xs={12} sm={8} md={4}>
            <Card 
                style={getCardStyle('outside', "#E6F7FF")} 
                styles={{ body: { padding: 15 } }}
                onClick={() => handleCardClick('outside')}
            >
              <Statistic title="นอกพื้นที่" value={summaryStats.outside} />
            </Card>
          </Col>

          <Col xs={12} sm={8} md={4}>
            <Card 
                style={getCardStyle('checkout', "#FFF")} 
                styles={{ body: { padding: 15 } }}
                onClick={() => handleCardClick('checkout')}
            >
              <Statistic
                title={selectedRange === "today" ? "เช็คเอาท์วันนี้" : "รวมเช็คเอาท์"}
                value={summaryStats.todayCheckouts}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* MAIN TABLE */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 24 } }}>
        <div style={{ marginBottom: 20 }}>
          <span style={{ marginRight: 12, fontWeight: 500 }}>สาขา :</span>
          <Select
            value={selectedBranch}
            onChange={setSelectedBranch}
            options={branchOptions}
            style={{ width: 250 }}
            size="large"
            showSearch
            optionFilterProp="label"
          />
            <Button 
            type="primary" 
            danger 
            icon={<SaveOutlined />} 
            onClick={() => handleProcessAbsence(false)}
            loading={processing}
            disabled={absentEmployeesList.length === 0}
            style={{ marginLeft:10 }}
        >
            บันทึกขาดงาน ({absentEmployeesList.length})
        </Button>
        </div>
 
        {/* ✅ ใช้ filteredDataSource แทนข้อมูลดิบ */}
        <Table
          dataSource={filteredDataSource}
          columns={selectedRange === "today" ? todayColumns : rangeColumns}
          rowKey={(r) => r.employeeId}
          expandable={
            selectedRange !== "today"
              ? { expandedRowRender }
              : undefined
          }
          bordered
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showQuickJumper: true,
            position: ["bottomCenter"],
          }}
        />
      </Card>
    </div>
  );
};

export default Dashboard;