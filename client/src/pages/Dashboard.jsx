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
  Alert,
  Typography,
  Avatar,
  notification
} from "antd";
import { 
    UserOutlined, 
    CheckCircleOutlined, 
    CloseCircleOutlined, 
    CarOutlined, 
    CoffeeOutlined, 
    ClockCircleOutlined,
    InfoCircleOutlined,
    CheckCircleFilled
} from "@ant-design/icons";
import { db } from "../firebase"; 
// ✅ เปลี่ยน import: เพิ่ม setDoc และ doc
import { collection, getDocs, setDoc, doc, getDoc } from "firebase/firestore";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import "dayjs/locale/th";

dayjs.locale("th");
dayjs.extend(isBetween);

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
  const [cutoffTimeStr, setCutoffTimeStr] = useState("16:00"); 
  const [isCutoffDone, setIsCutoffDone] = useState(false);
  
  const [todayString, setTodayString] = useState(dayjs().format("D MMMM YYYY เวลา HH:mm น."));

  // State สำหรับ Filter จาก Card
  const [filterType, setFilterType] = useState(null); 

  // Update Clock
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
      } finally {
        setLoading(false);
      }
  }, []);

  // Initial Load & Auto Refresh
  useEffect(() => {
    setLoading(true);
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000); 
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // ---------------------------------------------------------
  // 🔹 คำนวณรายชื่อคนขาดงาน (Live Calculation)
  // ---------------------------------------------------------
  const absentEmployeesList = useMemo(() => {
      const todayStr = dayjs().format("YYYY-MM-DD");
      
      const missing = employees.filter(emp => {
          const hasCheckin = checkins.find(c => c.employeeId === emp.employeeId && c.date === todayStr);
          
          const hasLeave = leaves.find(l => {
             const start = dayjs(l.start || l.date);
             const end = dayjs(l.end || l.date);
             return l.employeeId === emp.employeeId && dayjs(todayStr).isBetween(start, end, 'day', '[]');
          });

          return !hasCheckin && !hasLeave;
      }).map(emp => ({
          ...emp,
          status: 'ขาดงาน'
      }));
      return missing;
  }, [employees, checkins, leaves]);

  // ตรวจสอบว่าวันนี้ตัดยอดไปหรือยัง
  useEffect(() => {
      const todayStr = dayjs().format("YYYY-MM-DD");
      const hasAutoRecord = checkins.some(c => c.date === todayStr && c.isAutoAbsent === true);
      
      const now = dayjs();
      const [cutoffHour, cutoffMinute] = cutoffTimeStr.split(':').map(Number);
      const cutoffTimeDate = dayjs().hour(cutoffHour).minute(cutoffMinute).second(0);

      // ✅ เพิ่มเงื่อนไข !processing เข้าไปเพื่อให้แน่ใจว่าไม่ได้กำลังทำงานอยู่
      if (hasAutoRecord || (now.isAfter(cutoffTimeDate) && absentEmployeesList.length === 0)) {
          setIsCutoffDone(true);
      } else {
          setIsCutoffDone(false);
      }
  }, [checkins, absentEmployeesList, cutoffTimeStr]);

  // ---------------------------------------------------------
  // ⚙️ Auto Cutoff Logic (ทำงานทุก 1 นาที)
  // ---------------------------------------------------------
  useEffect(() => {
    // ✅ เพิ่มเงื่อนไข !isCutoffDone เข้าไป ถ้าเสร็จแล้วไม่ต้องเช็คซ้ำ
    if (loading || processing || isCutoffDone) return;

    const checkAutoProcess = async () => {
        const now = dayjs();
        const [cutoffHour, cutoffMinute] = cutoffTimeStr.split(':').map(Number);
        const cutoffTimeDate = dayjs().hour(cutoffHour).minute(cutoffMinute).second(0);

        if (now.isAfter(cutoffTimeDate) && absentEmployeesList.length > 0) {
            console.log(`⚡ Auto-processing Absences... Time: ${now.format('HH:mm')}`);
            await executeAutoCutoff(); 
        }
    };

    checkAutoProcess();
    const timer = setInterval(checkAutoProcess, 60000); 

    return () => clearInterval(timer);
  }, [loading, absentEmployeesList, processing, cutoffTimeStr, isCutoffDone]); 

  // ---------------------------------------------------------
  // 🔹 ฟังก์ชันยิงข้อมูลลง DB (แก้เป็น setDoc เพื่อกันซ้ำ)
  // ---------------------------------------------------------
  const executeAutoCutoff = async () => {
    setProcessing(true);
    try {
        const todayStr = dayjs().format("YYYY-MM-DD");
        const timestampStr = dayjs().format("YYYY-MM-DD HH:mm:ss");
        
        const promises = absentEmployeesList.map(emp => {
            // 🔥 สร้าง ID แบบกำหนดเอง: รหัสพนักงาน_วันที่
            // ถ้าบันทึกซ้ำ มันจะทับ ID เดิม ไม่เกิด record ใหม่
            const customDocId = `${emp.employeeId}_${todayStr}`;
            
            // ✅ ใช้ setDoc แทน addDoc
            return setDoc(doc(db, "employee_checkin", customDocId), {
                employeeId: emp.employeeId,
                name: emp.name,
                department: emp.department || "",
                branch: emp.branch || (emp.branches ? emp.branches[0] : ""),
                date: todayStr,
                checkinTime: "-", 
                checkoutTime: "-",
                timestamp: timestampStr,
                status: "ขาดงาน", 
                fine: fineAmount, 
                isAutoAbsent: true, 
                isManual: false
            });
        });

        await Promise.all(promises);
        
        notification.success({
            message: 'ตัดยอดอัตโนมัติสำเร็จ',
            description: `ระบบบันทึกขาดงาน ${absentEmployeesList.length} คน (ค่าปรับ ${fineAmount} บาท/คน)`,
            placement: 'topRight',
            duration: 5,
        });

        fetchAllData(); 

    } catch (err) {
        console.error(err);
        // message.error("Auto Cutoff Failed");
    } finally {
        setProcessing(false);
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
            const branches = Array.isArray(e.branches) ? e.branches : e.branch ? [e.branch] : [];
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

        if (!item.__isLeave && emp) {
          const empBranches = Array.isArray(emp.branches) ? emp.branches : emp.branch ? [emp.branch] : [];
          if (item.branch && empBranches.length > 0 && !empBranches.includes(item.branch)) {
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

    return Array.from(map.values()).sort((a, b) => {
       const timeA = a.checkinTime === "-" ? "" : a.checkinTime;
       const timeB = b.checkinTime === "-" ? "" : b.checkinTime;
       if (timeA && timeB) return timeB.localeCompare(timeA);
       if (timeA && !timeB) return -1;
       if (!timeA && timeB) return 1;
       return a.name.localeCompare(b.name);
    });

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
          summary: { late: 0, absent: 0, leave: 0, outside: 0, fine: 0 },
        });
      }

      const rec = map.get(item.employeeId);
      rec.history.push(item);

      if (item.status?.includes("สาย")) rec.summary.late += 1;
      if (item.status?.includes("หยุด") || item.status?.includes("ลา")) rec.summary.leave += 1;
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

  const filteredDataSource = useMemo(() => {
    let data = selectedRange === "today" ? todayData : groupedRangeData;
    if (!filterType || filterType === 'total') return data;

    return data.filter(item => {
        if (selectedRange === "today") {
            if (filterType === 'checkin') return item.checkinTime !== "-";
            if (filterType === 'checkout') return item.checkoutTime !== "-";
            if (filterType === 'late') return item.status?.includes("สาย");
            if (filterType === 'absent') return item.status?.includes("ลา") || item.status === "ขาดงาน";
            if (filterType === 'outside') return item.status === "นอกพื้นที่";
        } else {
            if (filterType === 'checkin') return item.history.some(h => h.checkinTime !== "-");
            if (filterType === 'checkout') return item.history.some(h => h.checkoutTime !== "-");
            if (filterType === 'late') return item.summary.late > 0;
            if (filterType === 'absent') return item.summary.absent > 0 || item.summary.leave > 0;
            if (filterType === 'outside') return item.summary.outside > 0;
        }
        return true;
    });
  }, [todayData, groupedRangeData, filterType, selectedRange]);

  const summaryStats = useMemo(() => {
    let late = 0, absent = 0, outside = 0, checkinsCount = 0, checkoutsCount = 0;

    if (selectedRange === "today") {
      todayData.forEach((d) => {
        if (d.checkinTime !== "-") checkinsCount++;
        if (d.checkoutTime !== "-") checkoutsCount++;
        if (d.status?.includes("สาย")) late++;
        if (d.status?.includes("หยุด") || d.status?.includes("ลา")) absent++;
        if (d.status === "ขาดงาน") absent++; 
        if (d.status === "นอกพื้นที่") outside++;
      });
    } else {
      groupedRangeData.forEach((d) => {
        late += d.summary.late;
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

  const handleCardClick = (type) => {
      setFilterType(prev => prev === type ? null : type);
  };

  const getCardStyle = (type, bgColor) => {
      const isSelected = filterType === type;
      return {
          background: bgColor,
          cursor: "pointer",
          transition: "all 0.3s",
          border: isSelected ? "2px solid #ff6b35" : "1px solid #f0f0f0",
          transform: isSelected ? "scale(1.02)" : "scale(1)",
          boxShadow: isSelected ? "0 4px 12px rgba(255, 107, 53, 0.2)" : "none"
      };
  };

  const todayColumns = [
    { title: "รหัส", dataIndex: "employeeId", width: 100 },
    { 
        title: "ชื่อ - สกุล", 
        dataIndex: "name", 
        render: (text, record) => (
            <div style={{display:'flex', alignItems:'center', gap:10}}>
                <Avatar icon={<UserOutlined />} src={record.pictureUrl} />
                <div>{text}</div>
            </div>
        )
    },
    { title: "สาขา", dataIndex: "branch", width: 150 },
    { 
        title: "เวลาเข้า", 
        dataIndex: "checkinTime", 
        align: 'center',
        render: (t) => t !== "-" ? <Tag color="blue">{t}</Tag> : <span style={{color:'#ccc'}}>-</span>
    },
    { 
        title: "เวลาออก", 
        dataIndex: "checkoutTime",
        align: 'center',
        render: (t) => t !== "-" ? <Tag color="cyan">{t}</Tag> : <span style={{color:'#ccc'}}>-</span>
    },
    {
      title: "สถานะ",
      dataIndex: "status",
      align: 'center',
      render: (text, record) => {
        let color = "green";
        if (text?.includes("สาย")) color = "orange";
        if (text?.includes("ลา")) color = "blue";
        if (text === "ขาดงาน") color = "red";
        if (text?.includes("นอกพื้นที่")) color = "purple";
        return (
            <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                <Tag color={color}>{text}</Tag>
                {record.isAutoAbsent && <small style={{color:'red', fontSize:10}}>Auto</small>}
            </div>
        );
      },
    },
    {
      title: "ค่าปรับ",
      dataIndex: "fine",
      align: 'right',
      render: (f) => (f > 0 ? <Text type="danger">{f} ฿</Text> : "-"),
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
    {
      title: "ขาดงาน",
      dataIndex: ["summary", "absent"],
      align: "center",
      render: (v) => (v > 0 ? <b style={{ color: "red" }}>{v}</b> : "-"),
    },
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
        rowKey={(r) => `${r.employeeId}_${r.date}_${r.checkinTime}_${r.__isLeave ? "leave" : "in"}`}
      />
    );
  };

  return (
    <div style={{ padding: "0" }}>
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

      {/* ✅ CARD แจ้งสถานะ Auto-Cutoff */}
      <Card
        styles={{ body: { padding: '0' } }} 
        style={{
          borderRadius: 12,
          marginBottom: 20,
          background: "#fff",
          overflow: "hidden"
        }}
      >
        <div>
           {isCutoffDone ? (
              <Alert 
                message="สถานะการตัดยอดประจำวัน"
                description={
                    <span>
                        <CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} />
                        <b>ระบบได้ทำการตัดยอดประจำวันเรียบร้อยแล้ว</b> (พนักงานที่ไม่มาและไม่ลา ถูกบันทึกเป็น "ขาดงาน")
                    </span>
                }
                type="success"
                showIcon={false}
                style={{ borderLeft: '5px solid #52c41a' }}
             />
           ) : (
              <Alert 
                message="รอการตัดยอดอัตโนมัติ"
                description={
                    <span>
                        <InfoCircleOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                        ระบบจะตัดยอดอัตโนมัติหลังเวลา <b>{cutoffTimeStr} น.</b> (ขาดงานปรับ {fineAmount} บาท)
                        {absentEmployeesList.length > 0 && <span style={{marginLeft: 10}}> | ⚠️ <b>รอตัดยอด: {absentEmployeesList.length} คน</b></span>}
                    </span>
                }
                type="info"
                showIcon={false}
                style={{ borderLeft: '5px solid #1890ff' }}
            />
           )}
        </div>
      </Card>

      {/* Summary Cards */}
      <Card
        styles={{ body: { padding: '20px' } }}
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
            <Card style={getCardStyle('total', "#FFE2E5")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('total')}>
              <Statistic title="พนักงานทั้งหมด" value={summaryStats.totalEmployees} prefix={<UserOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card style={getCardStyle('checkin', "#FFF4DE")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('checkin')}>
              <Statistic title="เข้างาน" value={summaryStats.todayCheckins} prefix={<CheckCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card style={getCardStyle('late', "#DCFCE7")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('late')}>
              <Statistic title="มาสาย" value={summaryStats.late} prefix={<ClockCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card style={getCardStyle('absent', "#F3E8FF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('absent')}>
              <Statistic title="ขาด/ลา" value={summaryStats.absent} prefix={<CloseCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card style={getCardStyle('outside', "#E6F7FF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('outside')}>
              <Statistic title="นอกพื้นที่" value={summaryStats.outside} prefix={<CarOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card style={getCardStyle('checkout', "#FFF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('checkout')}>
              <Statistic title={selectedRange === "today" ? "เช็คเอาท์วันนี้" : "รวมเช็คเอาท์"} value={summaryStats.todayCheckouts} />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* MAIN TABLE */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 24 } }} title="รายการลงเวลา">
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
        </div>
 
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