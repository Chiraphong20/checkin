import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Table,
  Card,
  Spin,
  Row,
  Col,
  Statistic,
  Select,
  Tag,
  Button,
  Alert,
  Typography,
  theme,
  Avatar,
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
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import "dayjs/locale/th";

dayjs.locale("th");
dayjs.extend(isBetween);

const { Title, Text } = Typography; 

const Dashboard = () => {
  // --- State ข้อมูล ---
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("ทั้งหมด");
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("today");

  // --- State สำหรับแสดงผล (ไม่ต้องมี processing แล้ว) ---
  const [fineAmount, setFineAmount] = useState(50);
  const [cutoffTimeStr, setCutoffTimeStr] = useState("16:00"); 
  const [isCutoffDone, setIsCutoffDone] = useState(false);
  const [todayString, setTodayString] = useState(dayjs().format("D MMMM YYYY เวลา HH:mm น."));

  // State Filter
  const [filterType, setFilterType] = useState(null); 
  const { token } = theme.useToken();

  // Update Clock UI
  useEffect(() => {
    const timer = setInterval(() => {
      setTodayString(dayjs().format("D MMMM YYYY เวลา HH:mm น."));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------
  // 🔹 โหลดข้อมูลทั้งหมด (Auto Refresh ทุก 1 นาที เพื่อดูผล)
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

  // โหลดข้อมูลและตั้งเวลา Refresh (เพื่อให้เห็นเมื่อ GitHub Actions ทำงานเสร็จ)
  useEffect(() => {
    setLoading(true);
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000); // รีเฟรชข้อมูลทุก 1 นาที
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // ---------------------------------------------------------
  // 🔹 คำนวณรายชื่อคนขาดงาน (เพื่อแสดงผลเท่านั้น)
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

  // ---------------------------------------------------------
  // 🔹 ตรวจสอบสถานะ: ตัดยอดไปหรือยัง?
  // ---------------------------------------------------------
  useEffect(() => {
      const todayStr = dayjs().format("YYYY-MM-DD");
      // เช็คว่า Database มีข้อมูล Auto Cutoff ของวันนี้หรือยัง?
      const hasAutoRecord = checkins.some(c => c.date === todayStr && c.isAutoAbsent === true);
      
      const now = dayjs();
      const [ch, cm] = cutoffTimeStr.split(':');
      const cutoffTime = dayjs().hour(ch).minute(cm);
      
      // ถ้ามี Record แล้ว หรือ เลยเวลาแล้วแต่ไม่มีคนขาดงานเหลือเลย = เสร็จแล้ว
      if (hasAutoRecord || (now.isAfter(cutoffTime) && absentEmployeesList.length === 0)) {
          setIsCutoffDone(true);
      } else {
          setIsCutoffDone(false);
      }
  }, [checkins, absentEmployeesList, cutoffTimeStr]);

  // ❌ ลบส่วน Auto Cutoff Logic (setInterval ยิง API) ออกแล้ว เพราะ GitHub Actions ทำหน้าที่แทน ❌

  // ---------------------------------------------------------
  // 🔹 UI Helpers
  // ---------------------------------------------------------
  const branchOptions = useMemo(() => [
      { value: "ทั้งหมด", label: "ทั้งหมด" },
      ...branches.map((b) => ({ value: b.name, label: b.name })),
  ], [branches]);

  const mergedCheckins = useMemo(() => {
    const leaveRecords = leaves.map((l) => {
      const emp = employees.find(e => e.employeeId === l.employeeId);
      const typeText = l.type || l.leaveType || "";
      const statusText = typeText ? `ลา (${typeText})` : "ลา";

      return {
        employeeId: l.employeeId,
        name: emp?.name || "ไม่ทราบชื่อ",
        branch: emp?.branch || "-",
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
    let data = selectedBranch === "ทั้งหมด" 
        ? mergedCheckins 
        : mergedCheckins.filter(c => {
            const emp = employees.find(e => e.employeeId === c.employeeId);
            const empBranches = emp?.branches || (emp?.branch ? [emp.branch] : []);
            return empBranches.includes(selectedBranch);
        });

    return data.filter((item) => {
        const itemDate = dayjs(item.date, "YYYY-MM-DD");
        if (selectedRange === "today") return itemDate.isSame(today, "day");
        if (selectedRange === "7days") return itemDate.isAfter(today.subtract(7, "day")) || itemDate.isSame(today, "day");
        if (selectedRange === "month") return itemDate.isSame(today, "month");
        return true;
    });
  }, [mergedCheckins, selectedBranch, selectedRange, employees]);

  const filteredDataSource = useMemo(() => {
    let data = processedCheckins;
    if (filterType) {
        data = data.filter(item => {
            if (filterType === 'checkin') return item.checkinTime !== "-";
            if (filterType === 'checkout') return item.checkoutTime !== "-";
            if (filterType === 'late') return item.status?.includes("สาย");
            if (filterType === 'absent') return item.status?.includes("ลา") || item.status === "ขาดงาน";
            if (filterType === 'outside') return item.status?.includes("นอกพื้นที่");
            return true;
        });
    }
    
    return data.sort((a, b) => {
        if (a.checkinTime !== "-" && b.checkinTime !== "-") return b.checkinTime.localeCompare(a.checkinTime);
        return 0;
    });
  }, [processedCheckins, filterType]);

  const summaryStats = useMemo(() => {
    let late = 0, absent = 0, outside = 0, checkinsCount = 0, checkoutsCount = 0;
    processedCheckins.forEach((d) => {
        if (d.checkinTime !== "-") checkinsCount++;
        if (d.checkoutTime !== "-") checkoutsCount++;
        if (d.status?.includes("สาย")) late++;
        if (d.status?.includes("ลา") || d.status === "ขาดงาน") absent++;
        if (d.status?.includes("นอกพื้นที่")) outside++;
    });
    return { totalEmployees: employees.length, checkinsCount, checkoutsCount, late, absent, outside };
  }, [processedCheckins, employees]);

  const handleCardClick = (type) => setFilterType(prev => prev === type ? null : type);

  const getCardStyle = (type, bgColor) => ({
      background: bgColor,
      cursor: "pointer",
      transition: "all 0.3s",
      border: filterType === type ? "2px solid #ff6b35" : "1px solid #f0f0f0",
      transform: filterType === type ? "scale(1.02)" : "scale(1)",
      boxShadow: filterType === type ? "0 4px 12px rgba(255, 107, 53, 0.2)" : "none"
  });

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
                {/* แสดงคำว่า Server Auto ถ้าเป็นการตัดยอดจาก GitHub */}
                {record.isAutoAbsent && <small style={{color:'red', fontSize:10}}>*Server Auto</small>}
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
    { title: "มาสาย", dataIndex: ["summary", "late"], align: "center", render: (v) => v > 0 ? <b style={{color:"orange"}}>{v}</b> : "-" },
    { title: "ขาดงาน", dataIndex: ["summary", "absent"], align: "center", render: (v) => v > 0 ? <b style={{color:"red"}}>{v}</b> : "-" },
    { title: "ลางาน", dataIndex: ["summary", "leave"], align: "center", render: (v) => v > 0 ? <b style={{color:"#1890ff"}}>{v}</b> : "-" },
    { title: "นอกพื้นที่", dataIndex: ["summary", "outside"], align: "center", render: (v) => v > 0 ? <b style={{color:"purple"}}>{v}</b> : "-" },
    { title: "ค่าปรับรวม", dataIndex: ["summary", "fine"], align: "right", render: (v) => v > 0 ? <span style={{color:"red"}}>{v} บาท</span> : "-" },
  ];

  const expandedRowRender = (record) => {
    // ... (คงเดิม)
    return <Table columns={todayColumns} dataSource={record.history} pagination={false} />;
  };

  return (
    <div style={{ padding: "0" }}>
      {loading && <Spin size="large" style={{ display: "flex", justifyContent: "center", marginBottom: 20 }} />}

      {/* ✅ CARD แจ้งสถานะ (Monitor Mode) */}
      <Card styles={{ body: { padding: '0' } }} style={{ borderRadius: 12, marginBottom: 20, background: "#fff", overflow: "hidden" }}>
        <div>
           {isCutoffDone ? (
              <Alert 
                message="สถานะการตัดยอดประจำวัน (Server)"
                description={
                    <span>
                        <CheckCircleFilled style={{ color: '#52c41a', marginRight: 8 }} />
                        <b>ระบบ Server (GitHub Actions) ได้ทำการตัดยอดแล้ว</b>
                    </span>
                }
                type="success"
                showIcon={false}
                style={{ borderLeft: '5px solid #52c41a' }}
             />
           ) : (
              <Alert 
                message="รอการตัดยอดอัตโนมัติ (Server)"
                description={
                    <span>
                        <InfoCircleOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                        ระบบ Server จะทำงานอัตโนมัติหลังเวลา <b>{cutoffTimeStr} น.</b> (คุณสามารถปิดหน้าจอนี้ได้)
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
      <Card styles={{ body: { padding: '20px' } }} style={{ borderRadius: 12, marginBottom: 20, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Select
            value={selectedRange}
            onChange={setSelectedRange}
            options={[ { label: "วันนี้", value: "today" }, { label: "7 วันล่าสุด", value: "7days" }, { label: "เดือนนี้", value: "month" } ]}
            style={{ width: 150 }}
            size="large"
          />
           {filterType && <Button type="link" onClick={() => setFilterType(null)} danger>ล้างตัวกรอง</Button>}
        </div>

        <Row gutter={[16, 16]} style={{ marginTop: 15 }}>
          {/* ... (Cards สรุปยอดเหมือนเดิม) ... */}
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle('total', "#FFE2E5")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('total')}><Statistic title="พนักงานทั้งหมด" value={summaryStats.totalEmployees} prefix={<UserOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle('checkin', "#FFF4DE")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('checkin')}><Statistic title="เข้างาน" value={summaryStats.todayCheckins} prefix={<CheckCircleOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle('late', "#DCFCE7")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('late')}><Statistic title="มาสาย" value={summaryStats.late} prefix={<ClockCircleOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle('absent', "#F3E8FF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('absent')}><Statistic title="ขาด/ลา" value={summaryStats.absent} prefix={<CloseCircleOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle('outside', "#E6F7FF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('outside')}><Statistic title="นอกพื้นที่" value={summaryStats.outside} prefix={<CarOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle('checkout', "#FFF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick('checkout')}><Statistic title="เช็คเอาท์" value={summaryStats.todayCheckouts} /></Card></Col>
        </Row>
      </Card>

      {/* MAIN TABLE */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 24 } }} title="รายการลงเวลา">
        <div style={{ marginBottom: 20 }}>
          <span style={{ marginRight: 12, fontWeight: 500 }}>สาขา :</span>
          <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} style={{ width: 250 }} size="large" showSearch optionFilterProp="label" />
        </div>
 
        <Table
          dataSource={filteredDataSource}
          columns={selectedRange === "today" ? todayColumns : rangeColumns}
          rowKey={(r) => r.employeeId}
          bordered
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default Dashboard;