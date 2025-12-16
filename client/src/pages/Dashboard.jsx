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
import { collection, getDocs, doc, getDoc, query, where, orderBy, limit } from "firebase/firestore";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import "dayjs/locale/th";
import { cache } from "../utils/cache";

dayjs.locale("th");
dayjs.extend(isBetween);

const { Text } = Typography;

const Dashboard = () => {
  // --- State ข้อมูล ---
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState("ทั้งหมด");
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("today");

  // --- State สำหรับแสดงผล ---
  const [fineAmount, setFineAmount] = useState(50);
  const [cutoffTimeStr, setCutoffTimeStr] = useState("16:00");
  const [isCutoffDone, setIsCutoffDone] = useState(false);
  // eslint-disable-next-line no-unused-vars
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
  // 🔹 โหลดข้อมูลทั้งหมด (Optimized with caching and date filtering)
  // ---------------------------------------------------------
  const fetchAllData = useCallback(async (isRefresh = false) => {
    try {
      // 1. ดึงค่า Config (with cache)
      try {
        const cachedSettings = cache.get('SETTINGS');
        if (cachedSettings && !isRefresh) {
          setFineAmount(cachedSettings.absentFine || 50);
          if (cachedSettings.checkoutTime) {
            setCutoffTimeStr(cachedSettings.checkoutTime);
          }
        } else {
          const settingsSnap = await getDoc(doc(db, "settings", "checkin"));
          if (settingsSnap.exists()) {
            const sData = settingsSnap.data();
            cache.set('SETTINGS', sData);
            setFineAmount(sData.absentFine || 50);
            if (sData.checkoutTime) {
              setCutoffTimeStr(sData.checkoutTime);
            }
          }
        }
      } catch (e) {
        console.log("Using default settings");
      }

      // 2. ดึงข้อมูลหลัก (with cache for branches and employees)
      // Branches - cache for 24 hours
      const cachedBranches = cache.get('BRANCHES');
      if (cachedBranches && !isRefresh) {
        setBranches(cachedBranches);
      } else {
        const branchSnap = await getDocs(collection(db, "branches"));
        const branchesData = branchSnap.docs.map((doc) => ({ id: doc.id, name: doc.data().name }));
        cache.set('BRANCHES', branchesData);
        setBranches(branchesData);
      }

      // Employees - cache for 30 minutes
      const cachedEmployees = cache.get('EMPLOYEES');
      if (cachedEmployees && !isRefresh) {
        setEmployees(cachedEmployees);
      } else {
        const empSnap = await getDocs(collection(db, "employees"));
        const employeesData = empSnap.docs.map((doc) => doc.data());
        cache.set('EMPLOYEES', employeesData);
        setEmployees(employeesData);
      }

      // 3. ดึงข้อมูล Check-ins และ Leaves (with date filtering)
      const today = dayjs();
      let startDate, endDate;

      // Calculate date range based on selectedRange
      if (selectedRange === "today") {
        startDate = today.format("YYYY-MM-DD");
        endDate = today.format("YYYY-MM-DD");
      } else if (selectedRange === "7days") {
        startDate = today.subtract(7, "day").format("YYYY-MM-DD");
        endDate = today.format("YYYY-MM-DD");
      } else if (selectedRange === "month") {
        startDate = today.startOf("month").format("YYYY-MM-DD");
        endDate = today.endOf("month").format("YYYY-MM-DD");
      } else {
        // Default: last 30 days
        startDate = today.subtract(30, "day").format("YYYY-MM-DD");
        endDate = today.format("YYYY-MM-DD");
      }

      // Fetch check-ins with date filter
      // Note: Firestore doesn't support range queries on same field, so we use >= and filter client-side
      const checkinQuery = query(
        collection(db, "employee_checkin"),
        where("date", ">=", startDate),
        orderBy("date", "desc")
      );
      const checkinSnap = await getDocs(checkinQuery);
      // Filter client-side to ensure we only get dates within range
      const checkinsData = checkinSnap.docs
        .map((doc) => doc.data())
        .filter((item) => item.date >= startDate && item.date <= endDate);
      setCheckins(checkinsData);

      // Fetch leaves - query from startDate onwards, then filter client-side
      // Leaves might have start/end dates, so we need to check if they overlap with our range
      const leaveQuery = query(
        collection(db, "employee_leave"),
        where("date", ">=", startDate),
        orderBy("date", "desc")
      );
      const leaveSnap = await getDocs(leaveQuery);
      // Filter leaves that overlap with our date range
      const leavesData = leaveSnap.docs
        .map((doc) => doc.data())
        .filter((leave) => {
          const leaveStart = dayjs(leave.start || leave.date);
          const leaveEnd = dayjs(leave.end || leave.date);
          const rangeStart = dayjs(startDate);
          const rangeEnd = dayjs(endDate);
          // Check if leave overlaps with our range
          return (
            (leaveStart.isSameOrBefore(rangeEnd) && leaveEnd.isSameOrAfter(rangeStart)) ||
            leave.date >= startDate
          );
        });
      setLeaves(leavesData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedRange]);

  // Initial Load & Smart Auto Refresh
  useEffect(() => {
    setLoading(true);
    fetchAllData(false); // Initial load with cache
    
    // Smart refresh: only refresh today's data every 2 minutes
    const interval = setInterval(() => {
      // Only refresh check-ins and leaves for today, keep cached branches/employees
      fetchAllData(true);
    }, 120000); // 2 minutes instead of 1 minute
    
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Refetch when selectedRange changes
  useEffect(() => {
    if (!loading) {
      fetchAllData(false);
    }
  }, [selectedRange]);

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
            dayjs(todayStr).isBetween(start, end, "day", "[]")
          );
        });

        return !hasCheckin && !hasLeave;
      })
      .map((emp) => ({
        ...emp,
        status: "ขาดงาน",
      }));
    return missing;
  }, [employees, checkins, leaves]);

  // ตรวจสอบว่าวันนี้ตัดยอดไปหรือยัง
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

  // ---------------------------------------------------------
  // 🔹 คำนวณจำนวนพนักงานแยกตามสาขา
  // ---------------------------------------------------------
  const branchEmployeeStats = useMemo(() => {
    const stats = {};
    branches.forEach((b) => {
      stats[b.name] = 0;
    });

    employees.forEach((emp) => {
      const empBranches = Array.isArray(emp.branches)
        ? emp.branches
        : emp.branch
        ? [emp.branch]
        : [];
      
      empBranches.forEach((bName) => {
        if (stats[bName] !== undefined) {
          stats[bName]++;
        } else {
          stats[bName] = (stats[bName] || 0) + 1;
        }
      });
    });

    return Object.keys(stats).map((key) => ({
      name: key,
      count: stats[key],
    }));
  }, [employees, branches]);

  // ---------------------------------------------------------
  // 🔹 Logic การ Filter ข้อมูล
  // ---------------------------------------------------------

  // 1. Filter พนักงานตามสาขาที่เลือกก่อน
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

  // 2. สร้าง Options Dropdown พร้อมตัวเลข
  const branchOptions = useMemo(() => {
     const countMap = branchEmployeeStats.reduce((acc, curr) => {
        acc[curr.name] = curr.count;
        return acc;
     }, {});

    return [
      { value: "ทั้งหมด", label: `ทั้งหมด (${employees.length} คน)` },
      ...branches.map((b) => ({
        value: b.name,
        label: `${b.name} (${countMap[b.name] || 0} คน)`,
      })),
    ];
  }, [branches, branchEmployeeStats, employees.length]);

  const branchEmployeeIds = useMemo(
    () => new Set(branchEmployees.map((e) => e.employeeId)),
    [branchEmployees]
  );

  // 3. รวมข้อมูล Checkin และ Leave
  const mergedCheckins = useMemo(() => {
    const leaveRecords = leaves.map((l) => {
      const emp = employees.find((e) => e.employeeId === l.employeeId);
      const typeText = l.type || l.leaveType || "";
      const statusText = typeText ? `ลา (${typeText})` : "ลา";

      return {
        employeeId: l.employeeId,
        name: emp?.name || "ไม่ทราบชื่อ",
        nickname: emp?.nickname || "-", // ✅ แก้ไขตรงนี้: ใช้ emp?.nickname แทน item.nickname
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

  // 4. Process ข้อมูลตามสาขา (เพิ่ม Nickname ตรงนี้)
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
          const empBranches = Array.isArray(emp.branches)
            ? emp.branches
            : emp.branch
            ? [emp.branch]
            : [];
          if (item.branch && empBranches.length > 0 && !empBranches.includes(item.branch)) {
            status = "นอกพื้นที่";
          }
        }
        // ✅ เพิ่ม nickname เข้าไปใน object (prioritize item -> emp -> "-")
        return { ...item, status, nickname: item.nickname || emp?.nickname || "-" };
      });
  }, [mergedCheckins, branchEmployeeIds, selectedBranch, selectedRange, employees]);

  // 5. Logic มุมมอง Today
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

    const absentForBranch = absentEmployeesList
      .filter((emp) => branchEmployeeIds.has(emp.employeeId))
      .filter((emp) => !presentIds.has(emp.employeeId))
      .map((emp) => ({
        employeeId: emp.employeeId,
        name: emp.name,
        nickname: emp.nickname || "-", // ✅ เพิ่ม nickname สำหรับคนขาดงาน
        branch: emp.branch || (Array.isArray(emp.branches) ? emp.branches[0] : "-"),
        date: dayjs().format("YYYY-MM-DD"),
        checkinTime: "-",
        checkoutTime: "-",
        status: "ขาดงาน",
        fine: fineAmount,
        pictureUrl: emp.pictureUrl,
        isAutoAbsent: false,
      }));

    finalData = [...finalData, ...absentForBranch];

    return finalData.sort((a, b) => {
      const timeA = a.checkinTime === "-" ? "" : a.checkinTime;
      const timeB = b.checkinTime === "-" ? "" : b.checkinTime;
      if (timeA && timeB) return timeB.localeCompare(timeA);
      if (timeA && !timeB) return -1;
      if (!timeA && timeB) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [processedCheckins, selectedRange, absentEmployeesList, branchEmployeeIds, fineAmount]);

  // 6. Logic มุมมอง Range
  const groupedRangeData = useMemo(() => {
    if (selectedRange === "today") return [];

    const map = new Map();

    processedCheckins.forEach((item) => {
      if (!map.has(item.employeeId)) {
        const emp = employees.find((e) => e.employeeId === item.employeeId);

        map.set(item.employeeId, {
          employeeId: item.employeeId,
          name: item.name || emp?.name || "-",
          nickname: item.nickname || emp?.nickname || "-", // ✅ เพิ่ม nickname
          branch: item.branch || (emp?.branches ? emp.branches[0] : emp?.branch) || "-",
          history: [],
          summary: {
            late: 0,
            absent: 0,
            leave: 0,
            outside: 0,
            checkin: 0,
            checkout: 0,
            fine: 0,
          },
        });
      }

      const rec = map.get(item.employeeId);
      rec.history.push(item);

      if (item.status?.includes("สาย")) rec.summary.late += 1;
      if (item.status?.includes("หยุด") || item.status?.includes("ลา")) rec.summary.leave += 1;
      if (item.status === "นอกพื้นที่") rec.summary.outside += 1;
      if (item.status === "ขาดงาน") {
        rec.summary.absent += 1;
      }
      if (item.checkinTime !== "-") rec.summary.checkin += 1;
      if (item.checkoutTime !== "-") rec.summary.checkout += 1;

      rec.summary.fine += parseInt(item.fine) || 0;
    });

    map.forEach((v) => {
      v.history.sort((a, b) => dayjs(b.date).diff(dayjs(a.date)));
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [processedCheckins, selectedRange, employees]);

  // 7. Filter ตาม Card Click
  const filteredDataSource = useMemo(() => {
    let data = selectedRange === "today" ? todayData : groupedRangeData;
    if (!filterType || filterType === "total") return data;

    return data.filter((item) => {
      if (selectedRange === "today") {
        if (filterType === "checkin") return item.checkinTime !== "-";
        if (filterType === "checkout") return item.checkoutTime !== "-";
        if (filterType === "late") return item.status?.includes("สาย");
        if (filterType === "absent")
          return item.status?.includes("ลา") || item.status === "ขาดงาน";
        if (filterType === "outside") return item.status?.includes("นอกพื้นที่");
      } else {
        if (filterType === "checkin") return item.summary.checkin > 0;
        if (filterType === "checkout") return item.summary.checkout > 0;
        if (filterType === "late") return item.summary.late > 0;
        if (filterType === "absent")
          return item.summary.absent > 0 || item.summary.leave > 0;
        if (filterType === "outside") return item.summary.outside > 0;
      }
      return true;
    });
  }, [todayData, groupedRangeData, filterType, selectedRange]);

  // 8. Stats Calculation
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
        if (d.status?.includes("หยุด") || d.status?.includes("ลา")) absent++;
        if (d.status === "ขาดงาน") absent++;
        if (d.status?.includes("นอกพื้นที่")) outside++;
      });
    } else {
      groupedRangeData.forEach((d) => {
        late += d.summary.late;
        absent += d.summary.absent + d.summary.leave;
        outside += d.summary.outside;
        checkinsCount += d.summary.checkin;
        checkoutsCount += d.summary.checkout;
      });
    }

    return {
      totalEmployees: branchEmployees.length,
      todayCheckins: checkinsCount,
      todayCheckouts: checkoutsCount,
      late,
      absent,
      outside,
    };
  }, [todayData, groupedRangeData, selectedRange, branchEmployees.length, employees.length]);

  const handleCardClick = (type) => {
    setFilterType((prev) => (prev === type ? null : type));
  };

  const getCardStyle = (type, bgColor) => {
    const isSelected = filterType === type;
    return {
      background: bgColor,
      cursor: "pointer",
      transition: "all 0.3s",
      border: isSelected ? "2px solid #ff6b35" : "1px solid #f0f0f0",
      transform: isSelected ? "scale(1.02)" : "scale(1)",
      boxShadow: isSelected ? "0 4px 12px rgba(255, 107, 53, 0.2)" : "none",
    };
  };

  const todayColumns = [
    { title: "รหัส", dataIndex: "employeeId", width: 100, align: 'center' },
    {
      title: "ชื่อ - สกุล",
      dataIndex: "name",  align: 'center',
      render: (text, record) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar icon={<UserOutlined />} src={record.pictureUrl} />
          <div>{text}</div>
        </div>
      ),
    },
    // ✅ เพิ่มคอลัมน์ชื่อเล่น
    { title: "ชื่อเล่น", dataIndex: "nickname", width: 100, align: 'center' },
    { title: "สาขา", dataIndex: "branch", width: 200 },
    {
      title: "เวลาเข้า",
      dataIndex: "checkinTime",
      align: "center",
      render: (t) =>
        t !== "-" ? <Tag color="blue">{t}</Tag> : <span style={{ color: "#ccc" }}>-</span>,
    },
    {
      title: "เวลาออก",
      dataIndex: "checkoutTime",
      align: "center",
      render: (t) =>
        t !== "-" ? <Tag color="cyan">{t}</Tag> : <span style={{ color: "#ccc" }}>-</span>,
    },
    {
      title: "สถานะ",
      dataIndex: "status",
      align: "center",
      render: (text, record) => {
        let color = "green";
        if (text?.includes("สาย")) color = "orange";
        if (text?.includes("ลา")) color = "blue";
        if (text === "ขาดงาน") color = "red";
        if (text?.includes("นอกพื้นที่")) color = "purple";
        return (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Tag color={color}>{text}</Tag>
            {record.isAutoAbsent && (
              <small style={{ color: "red", fontSize: 10 }}>*Server Auto</small>
            )}
          </div>
        );
      },
    },
    {
      title: "ค่าปรับ",
      dataIndex: "fine",
      align: "right",
      render: (f) => (f > 0 ? <Text type="danger">{f} ฿</Text> : "-"),
    },
  ];

  const rangeColumns = [
    { title: "รหัส", dataIndex: "employeeId", width: 80, align: 'center' },
    { title: "ชื่อ - สกุล", dataIndex: "name", width: 200 },
    // ✅ เพิ่มคอลัมน์ชื่อเล่น
    { title: "ชื่อเล่น", dataIndex: "nickname", width: 100, align: 'center' },
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
        rowKey={(r) =>
          `${r.employeeId}_${r.date}_${r.checkinTime}_${r.__isLeave ? "leave" : "in"}`
        }
      />
    );
  };

  return (
    <div style={{ padding: "0" }}>
      {loading && (
        <Spin
          size="large"
          style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}
        />
      )}

      {/* ✅ CARD แจ้งสถานะ */}
      <Card
        styles={{ body: { padding: "0" } }}
        style={{
          borderRadius: 12,
          marginBottom: 20,
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <div>
          {isCutoffDone ? (
            <Alert
              message="สถานะการตัดยอดประจำวัน (Server)"
              description={
                <span>
                  <CheckCircleFilled style={{ color: "#52c41a", marginRight: 8 }} />
                  <b>ระบบ Server (GitHub Actions) ได้ทำการตัดยอดแล้ว</b>
                </span>
              }
              type="success"
              showIcon={false}
              style={{ borderLeft: "5px solid #52c41a" }}
            />
          ) : (
            <Alert
              message="รอการตัดยอดอัตโนมัติ (Server)"
              description={
                <span>
                  <InfoCircleOutlined style={{ color: "#1890ff", marginRight: 8 }} />
                  ระบบ Server จะทำงานอัตโนมัติหลังเวลา <b>{cutoffTimeStr} น.</b>{" "}
                  (คุณสามารถปิดหน้าจอนี้ได้)
                  {absentEmployeesList.length > 0 && (
                    <span style={{ marginLeft: 10 }}>
                      {" "}
                      | ⚠️ <b>รอตัดยอด: {absentEmployeesList.length} คน</b>
                    </span>
                  )}
                </span>
              }
              type="info"
              showIcon={false}
              style={{ borderLeft: "5px solid #1890ff" }}
            />
          )}
        </div>
      </Card>

      {/* Summary Cards */}
      <Card
        styles={{ body: { padding: "20px" } }}
        style={{ borderRadius: 12, marginBottom: 20, background: "#fff" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
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
            <Button type="link" onClick={() => handleCardClick(null)} danger>
              ล้างตัวกรอง
            </Button>
          )}
        </div>

        <Row gutter={[16, 16]} style={{ marginTop: 15 }}>
          <Col xs={12} sm={8} md={4}>
            <Card
              style={getCardStyle("total", "#FFE2E5")}
              styles={{ body: { padding: 15 } }}
              onClick={() => handleCardClick("total")}
            >
              <Statistic
                title="พนักงานทั้งหมด"
                value={summaryStats.totalEmployees}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              style={getCardStyle("checkin", "#FFF4DE")}
              styles={{ body: { padding: 15 } }}
              onClick={() => handleCardClick("checkin")}
            >
              <Statistic
                title="เข้างาน"
                value={summaryStats.todayCheckins}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              style={getCardStyle("late", "#DCFCE7")}
              styles={{ body: { padding: 15 } }}
              onClick={() => handleCardClick("late")}
            >
              <Statistic
                title="มาสาย"
                value={summaryStats.late}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              style={getCardStyle("absent", "#F3E8FF")}
              styles={{ body: { padding: 15 } }}
              onClick={() => handleCardClick("absent")}
            >
              <Statistic
                title="ขาด/ลา"
                value={summaryStats.absent}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              style={getCardStyle("outside", "#E6F7FF")}
              styles={{ body: { padding: 15 } }}
              onClick={() => handleCardClick("outside")}
            >
              <Statistic
                title="นอกพื้นที่"
                value={summaryStats.outside}
                prefix={<CarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card
              style={getCardStyle("checkout", "#FFF")}
              styles={{ body: { padding: 15 } }}
              onClick={() => handleCardClick("checkout")}
            >
              <Statistic title="เช็คเอาท์" value={summaryStats.todayCheckouts} />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* ✅ ส่วนแสดงจำนวนพนักงานแยกตามสาขา (New Section) */}
      

      {/* MAIN TABLE */}
      <Card
        style={{ borderRadius: 12 }}
        styles={{ body: { padding: 24 } }}
        title="รายการลงเวลา"
      >
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
            selectedRange !== "today" ? { expandedRowRender } : undefined
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