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
  Avatar,
} from "antd";
import {
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CarOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  CheckCircleFilled,
  ShopOutlined,
} from "@ant-design/icons";
import { db } from "../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import "dayjs/locale/th";

dayjs.locale("th");
dayjs.extend(isBetween);

const { Text } = Typography;

const Dashboard = () => {
  // --- State ข้อมูล ---
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]); // ✅ เก็บวันหยุด
  const [selectedBranch, setSelectedBranch] = useState("ทั้งหมด");
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("today");
  const [branchMap, setBranchMap] = useState({}); // ✅ Map ชื่อสาขา -> ID

  // --- State สำหรับแสดงผล ---
  const [fineAmount, setFineAmount] = useState(50);
  const [cutoffTimeStr, setCutoffTimeStr] = useState("16:00");
  const [isCutoffDone, setIsCutoffDone] = useState(false);
  const [todayString, setTodayString] = useState(dayjs().format("D MMMM YYYY เวลา HH:mm น."));

  // State Filter
  const [filterType, setFilterType] = useState(null);

  // Update Clock UI
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
      // 1. Config
      const settingsSnap = await getDoc(doc(db, "settings", "checkin"));
      if (settingsSnap.exists()) {
        const sData = settingsSnap.data();
        setFineAmount(sData.absentFine || 50);
        if (sData.checkoutTime) setCutoffTimeStr(sData.checkoutTime);
      }

      // 2. Branches
      const branchSnap = await getDocs(collection(db, "branches"));
      const bList = branchSnap.docs.map((doc) => ({ id: doc.id, name: doc.data().name }));
      setBranches(bList);
      
      // Map Name -> ID เพื่อใช้เช็ควันหยุด
      const bMap = {};
      branchSnap.docs.forEach(doc => bMap[doc.data().name] = doc.id);
      setBranchMap(bMap);

      // 3. Employees
      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((doc) => doc.data()));

      // 4. Checkins
      const checkinSnap = await getDocs(collection(db, "employee_checkin"));
      setCheckins(checkinSnap.docs.map((doc) => doc.data()));

      // 5. Leaves
      const leaveSnap = await getDocs(collection(db, "employee_leave"));
      setLeaves(leaveSnap.docs.map((doc) => doc.data()));

      // 6. Holidays
      const holidaySnap = await getDocs(collection(db, "public_holidays"));
      setHolidays(holidaySnap.docs.map((doc) => doc.data()));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

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

    const missing = employees
      .filter((emp) => {
        const hasCheckin = checkins.find(
          (c) => c.employeeId === emp.employeeId && c.date === todayStr
        );

        const hasLeave = leaves.find((l) => {
          const start = dayjs(l.start || l.date);
          const end = dayjs(l.end || l.date);
          return (
            l.employeeId === emp.employeeId &&
            dayjs(todayStr).isBetween(start, end, "day", "[]") &&
            l.status === 'Approved'
          );
        });

        return !hasCheckin && !hasLeave;
      })
      .map((emp) => ({
        ...emp,
        status: "ขาดงาน", // Default status for list
      }));
    return missing;
  }, [employees, checkins, leaves]);

  // ตรวจสอบ Cutoff
  useEffect(() => {
    const todayStr = dayjs().format("YYYY-MM-DD");
    const hasAutoRecord = checkins.some(
      (c) => c.date === todayStr && c.isAutoAbsent === true
    );
    const now = dayjs();
    const [ch, cm] = cutoffTimeStr.split(":");
    const cutoffTime = dayjs().hour(ch).minute(cm);

    if (hasAutoRecord || (now.isAfter(cutoffTime) && absentEmployeesList.length === 0)) {
      setIsCutoffDone(true);
    } else {
      setIsCutoffDone(false);
    }
  }, [checkins, absentEmployeesList, cutoffTimeStr]);

  // Stats Calculation
  const branchEmployeeStats = useMemo(() => {
    const stats = {};
    branches.forEach((b) => { stats[b.name] = 0; });
    employees.forEach((emp) => {
      const empBranches = Array.isArray(emp.branches) ? emp.branches : emp.branch ? [emp.branch] : [];
      empBranches.forEach((bName) => { 
          if (stats[bName] !== undefined) stats[bName]++; 
          else stats[bName] = (stats[bName] || 0) + 1; 
      });
    });
    return Object.keys(stats).map((key) => ({ name: key, count: stats[key] }));
  }, [employees, branches]);

  // Filter Logic
  const branchEmployees = useMemo(() => 
      selectedBranch === "ทั้งหมด" 
        ? employees 
        : employees.filter((e) => {
            const branches = Array.isArray(e.branches) ? e.branches : e.branch ? [e.branch] : [];
            return branches.includes(selectedBranch);
          }), 
    [employees, selectedBranch]
  );

  const branchOptions = useMemo(() => {
     const countMap = branchEmployeeStats.reduce((acc, curr) => { acc[curr.name] = curr.count; return acc; }, {});
    return [
      { value: "ทั้งหมด", label: `ทั้งหมด (${employees.length} คน)` },
      ...branches.map((b) => ({ value: b.name, label: `${b.name} (${countMap[b.name] || 0} คน)` })),
    ];
  }, [branches, branchEmployeeStats, employees.length]);

  const branchEmployeeIds = useMemo(() => new Set(branchEmployees.map((e) => e.employeeId)), [branchEmployees]);

  const mergedCheckins = useMemo(() => {
    const leaveRecords = leaves.filter(l => l.status === 'Approved').map((l) => {
      const emp = employees.find((e) => e.employeeId === l.employeeId);
      const typeText = l.type || l.leaveType || "";
      const statusText = typeText ? `ลา (${typeText})` : "ลา";
      return {
        employeeId: l.employeeId,
        name: emp?.name || "ไม่ทราบชื่อ",
        nickname: emp?.nickname || "-",
        branch: emp?.branch || (Array.isArray(emp?.branches) ? emp.branches[0] : "-"),
        date: l.date, checkinTime: "-", checkoutTime: "-", status: statusText, fine: 0, __isLeave: true,
      };
    });
    return [...checkins, ...leaveRecords];
  }, [checkins, leaves, employees]);

  // ---------------------------------------------------------
  // ✅ แก้ไข: เพิ่ม Logic การคัดกรองข้อมูลซ้ำ (Priority)
  // ---------------------------------------------------------
  const processedCheckins = useMemo(() => {
    const today = dayjs();
    
    // 1. กรองตามสาขา
    let data = selectedBranch === "ทั้งหมด" 
      ? mergedCheckins 
      : mergedCheckins.filter((c) => branchEmployeeIds.has(c.employeeId));

    // 2. กรองตามช่วงเวลา
    data = data.filter((item) => {
        const itemDate = dayjs(item.date, "YYYY-MM-DD");
        if (selectedRange === "today") return itemDate.isSame(today, "day");
        if (selectedRange === "7days") return (itemDate.isAfter(today.subtract(7, "day")) || itemDate.isSame(today, "day"));
        if (selectedRange === "month") return itemDate.isSame(today, "month");
        return true;
      });

    // 3. Logic: ลบข้อมูลซ้ำ (ถ้ามีทั้ง 'ขาดงาน' และ 'ลา' ให้เอา 'ลา')
    const dedupedMap = new Map();
    
    data.forEach((item) => {
      const key = `${item.employeeId}_${item.date}`;
      
      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, item);
      } else {
        const existing = dedupedMap.get(key);
        
        // เช็ค Priority
        const isExistingAutoAbsent = existing.isAutoAbsent || existing.status === 'ขาดงาน';
        const isNewItemLeave = item.__isLeave;
        const isNewItemCheckin = item.checkinTime !== "-" && !item.isAutoAbsent;

        // ถ้าของเดิมเป็น Auto Absent แต่ของใหม่เป็น 'ลา' หรือ 'มาทำงานจริง' -> ให้ทับของเดิม
        if (isExistingAutoAbsent && (isNewItemLeave || isNewItemCheckin)) {
          dedupedMap.set(key, item);
        }
        // ถ้าของเดิมเป็น 'ลา' แต่ของใหม่เป็น 'มาทำงานจริง' (เผื่อกรณีลาแล้วมา) -> ให้ทับด้วยการมาทำงาน
        else if (existing.__isLeave && isNewItemCheckin) {
           dedupedMap.set(key, item);
        }
      }
    });

    const uniqueData = Array.from(dedupedMap.values());

    // 4. จัดรูปแบบสุดท้าย
    return uniqueData.map((item) => {
        const emp = employees.find((e) => e.employeeId === item.employeeId);
        let status = item.status;
        if (!item.__isLeave && emp) {
          const empBranches = Array.isArray(emp.branches) ? emp.branches : emp.branch ? [emp.branch] : [];
          if (item.branch && empBranches.length > 0 && !empBranches.includes(item.branch)) {
            status = "นอกพื้นที่";
          }
        }
        return { ...item, status, nickname: item.nickname || emp?.nickname || "-" };
      });
  }, [mergedCheckins, branchEmployeeIds, selectedBranch, selectedRange, employees]);

  // 🔹 Logic มุมมอง Today (แก้ไขสถานะตามเงื่อนไข)
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
        if (newTime >= existingTime || (existing.__isLeave && !item.__isLeave)) {
          map.set(key, item);
        }
      }
    });

    let finalData = Array.from(map.values());
    const presentIds = new Set(finalData.map((d) => d.employeeId));
    
    // เวลาปัจจุบัน
    const now = dayjs();
    const [ch, cm] = cutoffTimeStr.split(':');
    const cutoffTime = dayjs().hour(ch).minute(cm);
    const isPastCutoff = now.isAfter(cutoffTime); 
    const todayStr = dayjs().format("YYYY-MM-DD");

    // 2. เพิ่มพนักงานที่ยังไม่มา
    const absentForBranch = absentEmployeesList
      .filter((emp) => branchEmployeeIds.has(emp.employeeId))
      .filter((emp) => !presentIds.has(emp.employeeId))
      .map((emp) => {
        const isExec = emp.department === "01";
        
        // ✅ Logic วันหยุด Office (02)
        let isOfficeHoliday = false;
        if (emp.department === "02") {
            const todayDay = dayjs().day();
            const isWeekend = todayDay === 0 || todayDay === 6; // 0=Sun, 6=Sat
            
            // เช็ควันหยุดนักขัตฤกษ์ (เทียบ ID สาขา)
            const empBranchId = branchMap[emp.branch];
            const isPublicHoliday = holidays.some(h => 
                h.date === todayStr && 
                (!h.targetBranches || h.targetBranches === "ALL" || h.targetBranches.length === 0 || (empBranchId && Array.isArray(h.targetBranches) && h.targetBranches.includes(empBranchId)))
            );
            
            if (isWeekend || isPublicHoliday) isOfficeHoliday = true;
        }

        let status = isPastCutoff ? "ขาดงาน" : "ยังไม่เช็คอิน";
        let fine = isPastCutoff ? fineAmount : 0;

        if (isExec) { status = "ผู้บริหาร"; fine = 0; }
        if (isOfficeHoliday) { status = "วันหยุด"; fine = 0; }

        return {
          employeeId: emp.employeeId,
          name: emp.name,
          nickname: emp.nickname || "-",
          branch: emp.branch || "-",
          date: todayStr,
          checkinTime: "-",
          checkoutTime: "-",
          status: status,
          fine: fine,
          pictureUrl: emp.pictureUrl,
          isAutoAbsent: false,
        };
      });

    finalData = [...finalData, ...absentForBranch];

    return finalData.sort((a, b) => {
      const timeA = a.checkinTime === "-" ? "" : a.checkinTime;
      const timeB = b.checkinTime === "-" ? "" : b.checkinTime;
      if (timeA && timeB) return timeB.localeCompare(timeA);
      if (timeA && !timeB) return -1;
      if (!timeA && timeB) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [processedCheckins, selectedRange, absentEmployeesList, branchEmployeeIds, fineAmount, cutoffTimeStr, todayString, holidays, branchMap]);

  // Grouped Data (เหมือนเดิม)
  const groupedRangeData = useMemo(() => {
    if (selectedRange === "today") return [];
    const map = new Map();
    processedCheckins.forEach((item) => {
      if (!map.has(item.employeeId)) {
        const emp = employees.find((e) => e.employeeId === item.employeeId);
        map.set(item.employeeId, {
          employeeId: item.employeeId, name: item.name || emp?.name || "-", nickname: item.nickname || emp?.nickname || "-", branch: item.branch || "-",
          history: [], summary: { late: 0, absent: 0, leave: 0, outside: 0, checkin: 0, checkout: 0, fine: 0 },
        });
      }
      const rec = map.get(item.employeeId);
      rec.history.push(item);
      if (item.status?.includes("สาย")) rec.summary.late += 1;
      if (item.status?.includes("หยุด") || item.status?.includes("ลา")) rec.summary.leave += 1;
      if (item.status === "นอกพื้นที่") rec.summary.outside += 1;
      if (item.status === "ขาดงาน") rec.summary.absent += 1;
      if (item.checkinTime !== "-") rec.summary.checkin += 1;
      if (item.checkoutTime !== "-") rec.summary.checkout += 1;
      rec.summary.fine += parseInt(item.fine) || 0;
    });
    map.forEach((v) => { v.history.sort((a, b) => dayjs(b.date).diff(dayjs(a.date))); });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [processedCheckins, selectedRange, employees]);

  // Filter Data
  const filteredDataSource = useMemo(() => {
    let data = selectedRange === "today" ? todayData : groupedRangeData;
    if (!filterType || filterType === "total") return data;
    return data.filter((item) => {
      if (selectedRange === "today") {
        if (filterType === "checkin") return item.checkinTime !== "-";
        if (filterType === "checkout") return item.checkoutTime !== "-";
        if (filterType === "late") return item.status?.includes("สาย");
        if (filterType === "absent") return item.status?.includes("ลา") || item.status === "ขาดงาน" || item.status === "ยังไม่เช็คอิน" || item.status === "วันหยุด";
        if (filterType === "outside") return item.status?.includes("นอกพื้นที่");
      } else {
        if (filterType === "checkin") return item.summary.checkin > 0;
        if (filterType === "checkout") return item.summary.checkout > 0;
        if (filterType === "late") return item.summary.late > 0;
        if (filterType === "absent") return item.summary.absent > 0 || item.summary.leave > 0;
        if (filterType === "outside") return item.summary.outside > 0;
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
        if (d.status === "ขาดงาน" || d.status === "ยังไม่เช็คอิน") absent++; 
        if (d.status?.includes("นอกพื้นที่")) outside++;
      });
    } else {
      groupedRangeData.forEach((d) => {
        late += d.summary.late; absent += d.summary.absent + d.summary.leave; outside += d.summary.outside; checkinsCount += d.summary.checkin; checkoutsCount += d.summary.checkout;
      });
    }
    return { totalEmployees: branchEmployees.length, todayCheckins: checkinsCount, todayCheckouts: checkoutsCount, late, absent, outside };
  }, [todayData, groupedRangeData, selectedRange, branchEmployees.length]);

  const handleCardClick = (type) => { setFilterType((prev) => (prev === type ? null : type)); };
  const getCardStyle = (type, bgColor) => {
    const isSelected = filterType === type;
    return { background: bgColor, cursor: "pointer", transition: "all 0.3s", border: isSelected ? "2px solid #ff6b35" : "1px solid #f0f0f0", transform: isSelected ? "scale(1.02)" : "scale(1)", boxShadow: isSelected ? "0 4px 12px rgba(255, 107, 53, 0.2)" : "none" };
  };

  const todayColumns = [
    { title: "รหัส", dataIndex: "employeeId", width: 80, align: 'center' },
    { title: "ชื่อ - สกุล", dataIndex: "name", render: (text, record) => <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar icon={<UserOutlined />} src={record.pictureUrl} /><div>{text}</div></div> },
    { title: "ชื่อเล่น", dataIndex: "nickname", width: 100, align: 'center' },
    { title: "สาขา", dataIndex: "branch", width: 150 },
    { title: "เวลาเข้า", dataIndex: "checkinTime", align: "center", render: (t) => t !== "-" ? <Tag color="blue">{t}</Tag> : <span style={{ color: "#ccc" }}>-</span> },
    { title: "เวลาออก", dataIndex: "checkoutTime", align: "center", render: (t) => t !== "-" ? <Tag color="cyan">{t}</Tag> : <span style={{ color: "#ccc" }}>-</span> },
    { title: "สถานะ", dataIndex: "status", align: "center", render: (text, record) => {
        let color = "green";
        if (text?.includes("สาย")) color = "orange";
        if (text?.includes("ลา")) color = "blue";
        if (text === "ขาดงาน") color = "red";
        if (text?.includes("นอกพื้นที่")) color = "purple";
        if (text === "ยังไม่เช็คอิน") color = "gold";
        if (text === "ผู้บริหาร") color = "cyan";
        if (text === "วันหยุด") color = "success";
        return (<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><Tag color={color}>{text}</Tag>{record.isAutoAbsent && <small style={{ color: "red", fontSize: 10 }}>*Server Auto</small>}</div>);
      } },
    { title: "ค่าปรับ", dataIndex: "fine", align: "right", render: (f) => (f > 0 ? <Text type="danger">{f} ฿</Text> : "-") },
  ];

  const rangeColumns = [
    { title: "รหัส", dataIndex: "employeeId", width: 80, align: 'center' },
    { title: "ชื่อ - สกุล", dataIndex: "name", width: 200 },
    { title: "ชื่อเล่น", dataIndex: "nickname", width: 100, align: 'center' },
    { title: "มาสาย", dataIndex: ["summary", "late"], align: "center", render: (v) => (v > 0 ? <b style={{ color: "orange" }}>{v}</b> : "-") },
    { title: "ขาดงาน", dataIndex: ["summary", "absent"], align: "center", render: (v) => (v > 0 ? <b style={{ color: "red" }}>{v}</b> : "-") },
    { title: "ลางาน", dataIndex: ["summary", "leave"], align: "center", render: (v) => (v > 0 ? <b style={{ color: "#1890ff" }}>{v}</b> : "-") },
    { title: "นอกพื้นที่", dataIndex: ["summary", "outside"], align: "center", render: (v) => (v > 0 ? <b style={{ color: "purple" }}>{v}</b> : "-") },
    { title: "ค่าปรับรวม", dataIndex: ["summary", "fine"], align: "right", render: (v) => (v > 0 ? <span style={{ color: "red" }}>{v} บาท</span> : "-") },
  ];

  const expandedRowRender = (record) => {
    const cols = [
      { title: "วันที่", dataIndex: "date", render: (d) => dayjs(d).format("DD/MM/YYYY") },
      { title: "เวลาเข้า", dataIndex: "checkinTime" },
      { title: "เวลาออก", dataIndex: "checkoutTime" },
      { title: "สาขา", dataIndex: "branch" },
      { title: "สถานะ", dataIndex: "status", render: (text) => { let color = "green"; if (text?.includes("สาย")) color = "orange"; if (text?.includes("ลา") || text?.includes("ขาดงาน")) color = "red"; if (text?.includes("นอกพื้นที่")) color = "purple"; return <Tag color={color}>{text}</Tag>; } },
      { title: "ค่าปรับ", dataIndex: "fine", render: (v) => (v > 0 ? <span style={{ color: "red" }}>{v}</span> : "-") },
    ];
    return <Table columns={cols} dataSource={record.history} size="small" pagination={false} rowKey={(r) => `${r.employeeId}_${r.date}_${r.checkinTime}_${r.__isLeave ? "leave" : "in"}`} />;
  };

  return (
    <div style={{ padding: "0" }}>
      {loading && <Spin size="large" style={{ display: "flex", justifyContent: "center", marginBottom: 20 }} />}
      <Card styles={{ body: { padding: "0" } }} style={{ borderRadius: 12, marginBottom: 20, background: "#fff", overflow: "hidden" }}>
        <div>{isCutoffDone ? <Alert message="สถานะการตัดยอดประจำวัน (Server)" description={<span><CheckCircleFilled style={{ color: "#52c41a", marginRight: 8 }} /><b>ระบบ Server (GitHub Actions) ได้ทำการตัดยอดแล้ว</b></span>} type="success" showIcon={false} style={{ borderLeft: "5px solid #52c41a" }} /> : <Alert message="รอการตัดยอดอัตโนมัติ (Server)" description={<span><InfoCircleOutlined style={{ color: "#1890ff", marginRight: 8 }} />ระบบ Server จะทำงานอัตโนมัติหลังเวลา <b>{cutoffTimeStr} น.</b> (คุณสามารถปิดหน้าจอนี้ได้){absentEmployeesList.length > 0 && (<span style={{ marginLeft: 10 }}> | ⚠️ <b>รอตัดยอด: {absentEmployeesList.length} คน</b></span>)}</span>} type="info" showIcon={false} style={{ borderLeft: "5px solid #1890ff" }} />}</div>
      </Card>
      <Card styles={{ body: { padding: "20px" } }} style={{ borderRadius: 12, marginBottom: 20, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Select value={selectedRange} onChange={setSelectedRange} options={[{ label: "วันนี้", value: "today" }, { label: "7 วันล่าสุด", value: "7days" }, { label: "เดือนนี้", value: "month" }]} style={{ width: 150 }} size="large" />
          {filterType && <Button type="link" onClick={() => handleCardClick(null)} danger>ล้างตัวกรอง</Button>}
        </div>
        <Row gutter={[16, 16]} style={{ marginTop: 15 }}>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle("total", "#FFE2E5")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick("total")}><Statistic title="พนักงานทั้งหมด" value={summaryStats.totalEmployees} prefix={<UserOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle("checkin", "#FFF4DE")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick("checkin")}><Statistic title="เข้างาน" value={summaryStats.todayCheckins} prefix={<CheckCircleOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle("late", "#DCFCE7")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick("late")}><Statistic title="มาสาย" value={summaryStats.late} prefix={<ClockCircleOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle("absent", "#F3E8FF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick("absent")}><Statistic title="ขาด/ลา/ยังไม่มา" value={summaryStats.absent} prefix={<CloseCircleOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle("outside", "#E6F7FF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick("outside")}><Statistic title="นอกพื้นที่" value={summaryStats.outside} prefix={<CarOutlined />} /></Card></Col>
          <Col xs={12} sm={8} md={4}><Card style={getCardStyle("checkout", "#FFF")} styles={{ body: { padding: 15 } }} onClick={() => handleCardClick("checkout")}><Statistic title="เช็คเอาท์" value={summaryStats.todayCheckouts} /></Card></Col>
        </Row>
      </Card>
      <Card title={<span><ShopOutlined /> จำนวนพนักงานรายสาขา</span>} style={{ borderRadius: 12, marginBottom: 20, background: "#fff" }} styles={{ body: { padding: "20px" } }}>
        <Row gutter={[16, 16]}>
          {branchEmployeeStats.map((branch) => (
            <Col xs={12} sm={8} md={6} lg={4} key={branch.name}><Card bordered={true} hoverable style={{ textAlign: "center", background: selectedBranch === branch.name ? "#e6f7ff" : "#fafafa", borderColor: selectedBranch === branch.name ? "#1890ff" : "#f0f0f0" }} styles={{ body: { padding: 10 } }} onClick={() => setSelectedBranch(branch.name)}><Statistic title={branch.name} value={branch.count} suffix="คน" valueStyle={{ fontSize: "1.2rem", color: "#1890ff" }} /></Card></Col>
          ))}
        </Row>
      </Card>
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 24 } }} title="รายการลงเวลา">
        <div style={{ marginBottom: 20 }}><span style={{ marginRight: 12, fontWeight: 500 }}>สาขา :</span><Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} style={{ width: 250 }} size="large" showSearch optionFilterProp="label" /></div>
        <Table dataSource={filteredDataSource} columns={selectedRange === "today" ? todayColumns : rangeColumns} rowKey={(r) => r.employeeId} expandable={selectedRange !== "today" ? { expandedRowRender } : undefined} bordered pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"], showQuickJumper: true, position: ["bottomCenter"] }} />
      </Card>
    </div>
  );
};

export default Dashboard;