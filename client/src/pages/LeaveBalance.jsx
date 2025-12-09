// LeaveBalance.jsx (updated)
import React, { useEffect, useState } from "react";
import { Card, Typography, Spin, message, Space, Progress, Button, Modal, List, Avatar, Divider, Statistic, Tag, Select } from "antd";
import { UserOutlined, CalendarOutlined, FileTextOutlined, ClockCircleOutlined, FieldTimeOutlined, CrownOutlined, WarningOutlined } from "@ant-design/icons";
import liff from "@line/liff";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import "dayjs/locale/th";

dayjs.locale('th');
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;
const { Option } = Select;

const departments = [
  { code: "01", name: "ผู้บริหาร" },
  { code: "02", name: "Office" },
  { code: "03", name: "พนักงานขาย" },
  { code: "04", name: "พนักงานขนส่ง" },
];

export default function LeaveBalance() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [branchMap, setBranchMap] = useState({}); // เก็บคู่ { ชื่อสาขา: ID }
  const [myBranchId, setMyBranchId] = useState(null);

  const [leaveData, setLeaveData] = useState({
    monthlyQuota: 0,
    accumulatedQuota: 0,
    remainingQuota: 0,
    annualLeaveTotal: 0,
    annualLeaveUsed: 0,
    usedLeaveMonth: 0,
    holidaysInMonth: 0,
    holidaysInYear: 0,
    workDuration: { years: 0, months: 0, days: 0 },
    isPrivileged: false,
    isSalesOrTransport: false,
    compensatory: { totalEarned: 0, used: 0, remaining: 0 },
    combinedLimit: { max: 0, used: 0, remaining: 0 }
  });

  const [historyList, setHistoryList] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allPublicHolidays, setAllPublicHolidays] = useState([]);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(dayjs().year());

  const calculateWorkDuration = (startDate) => {
    if (!startDate) return { years: 0, months: 0, days: 0 };
    const start = dayjs(startDate);
    const now = dayjs();
    const years = now.diff(start, 'year');
    const months = now.diff(start.add(years, 'year'), 'month');
    const days = now.diff(start.add(years, 'year').add(months, 'month'), 'day');
    return { years, months, days };
  };

  const getAnnualLeaveQuota = (years, departmentCode) => {
    const bonus = ["01", "02"].includes(departmentCode) ? 2 : 0;
    if (years < 1) return 0;
    if (years < 3) return 6 + bonus;
    if (years < 5) return 8 + bonus;
    return 12 + bonus;
  };

  // ----------------------------------------------------------
  // Compensatory logic (align with EmployeeLeaveDashboard.jsx)
  // per-date logic:
  // - only for Sales/Transport (03/04)
  // - for each holiday date h:
  //     if date is past AND targetBranches !== "ALL" AND
  //     employee's branch is NOT in targetBranches => earned++
  // - used = count of employee_leave where type === "หยุดชดเชย"
  // ----------------------------------------------------------
  const calculateCompensatory = (allHolidays = [], allLeaves = [], branchId, deptCode) => {
    const isSalesOrTransport = ["03", "04"].includes(deptCode);
    if (!isSalesOrTransport) return { totalEarned: 0, used: 0, remaining: 0 };

    const today = dayjs().startOf('day');
    const earnedDates = new Set();

    allHolidays.forEach(h => {
      if (!h || !h.date) return;
      const dateStr = h.date;
      // only past dates
      if (!dayjs(dateStr).isBefore(today, 'day')) return;

      // targetBranches handling
      const target = (!h.targetBranches || h.targetBranches === "ALL" || (Array.isArray(h.targetBranches) && h.targetBranches.length === 0))
        ? "ALL"
        : h.targetBranches; // expect array of branch IDs generally

      // if "ALL" => no comp for anyone
      if (target === "ALL") return;

      // if array => check membership
      const branchStopped = Array.isArray(target) ? target.includes(branchId) : (String(target) === String(branchId));

      // special rule: if branchStopped but allowSales === false -> sales must work -> treat as NOT stopped
      const isMyBranchStopped = branchStopped && !!h.allowSales ? true : (branchStopped && !h.allowSales ? false : branchStopped);

      // If my branch did NOT stop, but SOME branch(s) did stop (target has length>0) => earn comp for this date
      const someBranchesStopped = Array.isArray(target) && target.length > 0;
      if (!isMyBranchStopped && someBranchesStopped) {
        earnedDates.add(dateStr);
      }
    });

    const earned = earnedDates.size;
    const used = Array.isArray(allLeaves) ? allLeaves.filter(l =>
      l.type === "หยุดชดเชย" && ["Approved", "Pending"].includes(l.status)
    ).length : 0;

    return {
      totalEarned: earned,
      used: used,
      remaining: Math.max(0, earned - used)
    };
  };

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: "2008408737-4x2nLQp8" });
        if (!liff.isLoggedIn()) { liff.login(); return; }
        const profile = await liff.getProfile();

        // 1. โหลดข้อมูลสาขา (เพื่อทำ Map ชื่อ -> ID)
        const branchesSnap = await getDocs(collection(db, "branches"));
        const bMap = {};
        let bList = [];
        branchesSnap.forEach(doc => {
          const data = doc.data();
          bMap[data.name] = doc.id; // Key=ชื่อ, Value=ID
          bList.push({ id: doc.id, name: data.name });
        });
        setBranchMap(bMap);

        // 2. ดึงข้อมูลพนักงาน
        const q = query(collection(db, "employees"), where("lineUserId", "==", profile.userId));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          message.warning("ไม่พบข้อมูลพนักงาน");
          setLoading(false);
          return;
        }
        const empDoc = querySnapshot.docs[0];
        const empData = { employeeId: empDoc.id, ...empDoc.data() };
        empData.pictureUrl = profile.pictureUrl || empData.profileImage;
        setEmployee(empData);

        // หา ID สาขาของพนักงาน (รองรับกรณี DB เก็บเป็นชื่อ)
        const currentBranchId = bMap[empData.branch] || empData.branch;
        setMyBranchId(currentBranchId);

        // 3. ดึงข้อมูลวันหยุด
        const holidaysSnap = await getDocs(collection(db, "public_holidays"));
        const holidaysData = holidaysSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.date.localeCompare(b.date));
        setAllPublicHolidays(holidaysData);

        // หาวันที่เราหยุดจริง (สำหรับคำนวณโควต้าเดือน)
        const myHolidaysDates = holidaysData.filter(h => {
          if (["01", "02"].includes(empData.department)) return true; // Office ได้หยุดทั้งหมด

          let isBranchOff = false;
          if (!h.targetBranches || h.targetBranches === "ALL" || (Array.isArray(h.targetBranches) && h.targetBranches.length === 0)) isBranchOff = true;
          else if (Array.isArray(h.targetBranches)) isBranchOff = h.targetBranches.includes(currentBranchId);

          // ถ้า Sales และสาขาหยุดแต่ allowSales === false => Sales ต้องมาทำงาน -> treat as not stopped
          if (isBranchOff && empData.department === "03" && !h.allowSales) isBranchOff = false;

          return isBranchOff;
        }).map(h => h.date);

        const currentYear = dayjs().format("YYYY");
        const currentMonthStr = dayjs().format("YYYY-MM");

        // 4. ดึงประวัติการเข้า-ออก และวันลา
        const checkInQuery = query(collection(db, "employee_checkin"), where("employeeId", "==", empData.employeeId));
        const checkIns = (await getDocs(checkInQuery)).docs.map(d => d.data());

        const leaveQuery = query(collection(db, "employee_leave"), where("employeeId", "==", empData.employeeId));
        const leavesSnap = await getDocs(leaveQuery);
        const leaves = leavesSnap.docs.map(d => d.data());

        let allRecords = [];
        checkIns.forEach(item => {
          const isOff = item.status && (item.status.includes("หยุด") || item.status.includes("ขาด") || item.status.includes("สายมา") || item.status.includes("ลา"));
          if (isOff && item.date.startsWith(currentYear)) {
            allRecords.push({ date: item.date, type: "checkin", status: item.status });
          }
        });

        leaves.forEach(l => {
          const start = dayjs(l.start || l.date);
          const end = dayjs(l.end || l.date);
          let curr = start;
          while (curr.isSameOrBefore(end, 'day')) {
            const dStr = curr.format("YYYY-MM-DD");
            if (dStr.startsWith(currentYear)) {
              if (!allRecords.find(r => r.date === dStr)) {
                allRecords.push({ date: dStr, type: "leave", status: l.type, reason: l.reason, leaveStatus: l.status });
              }
            }
            curr = curr.add(1, 'day');
          }
        });

        const holidaysInYear = myHolidaysDates.filter(date => date.startsWith(currentYear)).length;
        const holidaysInMonth = myHolidaysDates.filter(date => date.startsWith(currentMonthStr)).length;

        const isOffice = ["01", "02"].includes(empData.department);
        const isSalesOrTransport = ["03", "04"].includes(empData.department);

        // <-- FIX: use joinDate (primary) with fallback to startDate -->
        const employmentDate = empData.joinDate || empData.startDate || null;
        const workDuration = calculateWorkDuration(employmentDate);

        const annualTotal = getAnnualLeaveQuota(workDuration.years, empData.department);
        const annualUsedTotal = allRecords.filter(r => r.status && r.status.includes("พักร้อน") && r.leaveStatus === 'Approved').length;

        let monthlyQuota = 0;
        let accumulatedQuota = 0;
        let usedMonth = 0;
        let combinedMax = 0;
        let combinedUsed = 0;

        const countWeekends = (month) => {
          let count = 0;
          const daysInMonth = month.daysInMonth();
          for (let i = 1; i <= daysInMonth; i++) {
            const d = month.date(i);
            const dayOfWeek = d.day();
            if (dayOfWeek === 0 || dayOfWeek === 6) count++;
          }
          return count;
        };

        if (isOffice) {
          // Office: เสาร์ + อาทิตย์ + นักขัตฤกษ์ (myHolidaysDates already includes all for Office)
          monthlyQuota = countWeekends(dayjs());
          // เพิ่มจำนวนวันหยุดนักขัตฤกษ์ในเดือนนี้ (myHolidaysDates คำนวณข้างบน)
          monthlyQuota += holidaysInMonth;
          usedMonth = allRecords.filter(r => {
            const isThisMonth = r.date.startsWith(currentMonthStr);
            const isHoliday = myHolidaysDates.includes(r.date);
            const isVacation = r.status.includes("พักร้อน");
            return isThisMonth && !isHoliday && !isVacation;
          }).length;
        } else {
          const currentMonthIndex = dayjs().month();
          monthlyQuota = (currentMonthIndex === 1) ? 4 : 5;
          usedMonth = allRecords.filter(r => {
            const isThisMonth = r.date.startsWith(currentMonthStr);
            const isHoliday = myHolidaysDates.includes(r.date);
            const isVacation = r.status.includes("พักร้อน");
            const isCompensatory = r.status.includes("หยุดชดเชย");
            const isSick = r.status.includes("ลาป่วย");
            const isPersonal = r.status.includes("ลากิจ");
            return isThisMonth && !isHoliday && !isVacation && !isCompensatory && !isSick && !isPersonal;
          }).length;

          combinedMax = (currentMonthIndex === 1) ? 9 : 10;
          const usedVacationThisMonth = allRecords.filter(r => r.date.startsWith(currentMonthStr) && r.status.includes("พักร้อน")).length;
          combinedUsed = usedMonth + usedVacationThisMonth;
        }

        const remainingQuota = (monthlyQuota + accumulatedQuota) - usedMonth;

        // คำนวณวันหยุดชดเชยสะสม (ใช้ Branch ID ที่ถูกต้อง)
        const compData = calculateCompensatory(holidaysData, leaves, currentBranchId, empData.department);

        const history = allRecords
          .filter(r => r.date.startsWith(currentMonthStr))
          .sort((a, b) => b.date.localeCompare(a.date));

        setLeaveData({
          monthlyQuota,
          accumulatedQuota,
          remainingQuota,
          annualLeaveTotal: annualTotal,
          annualLeaveUsed: annualUsedTotal,
          usedLeaveMonth: usedMonth,
          holidaysInMonth,
          holidaysInYear,
          workDuration,
          isPrivileged: isOffice,
          isSalesOrTransport,
          compensatory: compData,
          combinedLimit: { max: combinedMax, used: combinedUsed, remaining: Math.max(0, combinedMax - combinedUsed) }
        });

        setHistoryList(history);
        setLoading(false);

      } catch (err) {
        console.error(err);
        message.error("เกิดข้อผิดพลาดในการดึงข้อมูล");
        setLoading(false);
      }
    };
    initLiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div style={{ minHeight: "100vh", display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div>;
  if (!employee) return null;

  const departmentName = departments.find((d) => d.code === employee.department)?.name || "-";
  const totalAvailable = leaveData.monthlyQuota + leaveData.accumulatedQuota;
  const percent = totalAvailable > 0 ? (leaveData.usedLeaveMonth / totalAvailable) * 100 : 0;

  // กรองวันหยุดตามปีที่เลือก
  const filteredHolidays = allPublicHolidays.filter(h => h.date && h.date.startsWith(selectedYear.toString()));
  const availableYears = [...new Set(allPublicHolidays.map(h => h.date ? dayjs(h.date).year() : null).filter(Boolean))].sort((a, b) => b - a);
  const combinedPercent = leaveData.combinedLimit.max > 0 ? (leaveData.combinedLimit.used / leaveData.combinedLimit.max) * 100 : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fa", paddingBottom: 40, fontFamily: "'Sarabun', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #FF6539 0%, #ff8e6f 100%)", padding: "30px 20px 50px 20px", borderBottomLeftRadius: 30, borderBottomRightRadius: 30, color: "white", boxShadow: "0 4px 15px rgba(255, 101, 57, 0.3)" }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Avatar size={70} icon={<UserOutlined />} src={employee.pictureUrl} style={{ backgroundColor: 'white', color: '#FF6539', border: '3px solid rgba(255,255,255,0.5)' }} />
          <div>
            <Title level={4} style={{ color: "white", margin: 0 }}>{employee.name}</Title>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{departmentName} | {employee.branch || "-"}</Text>
            <div style={{ marginTop: 6 }}>
             <Tag icon={<ClockCircleOutlined />} color="#fff" style={{ borderRadius: 12, border: 'none', color: '#d4380d', fontWeight: 'bold' }}>
  อายุงาน: {leaveData.workDuration.years} ปี {leaveData.workDuration.months} เดือน {leaveData.workDuration.days} วัน
</Tag>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px", marginTop: -35 }}>
        {/* Alert แจ้งเตือนลิมิตรวม (เฉพาะ Sales/Transport) */}
        {leaveData.isSalesOrTransport && (
          <Card bordered={false} style={{ borderRadius: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.05)", marginBottom: 20, background: '#fff' }}>
            <Title level={5} style={{ margin: "0 0 10px 0", color: '#cf1322' }}>
              <WarningOutlined /> ลิมิตการหยุดรวมเดือนนี้
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              (หยุดประจำเดือน + พักร้อน ไม่เกิน {leaveData.combinedLimit.max} วัน)
            </Text>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text strong>ใช้ไป: {leaveData.combinedLimit.used} วัน</Text>
                <Text type={leaveData.combinedLimit.remaining === 0 ? "danger" : "secondary"}>
                  เหลือ {leaveData.combinedLimit.remaining} วัน
                </Text>
              </div>
              <Progress
                percent={combinedPercent}
                status={leaveData.combinedLimit.remaining === 0 ? "exception" : "active"}
                strokeColor={leaveData.combinedLimit.remaining === 0 ? "#ff4d4f" : "#1890ff"}
              />
            </div>
          </Card>
        )}

        {/* Card 1: วันหยุดประจำเดือน */}
        <Card bordered={false} style={{ borderRadius: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.05)", marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <div>
              <Title level={5} style={{ margin: 0, color: '#333' }}>
                <CalendarOutlined style={{ color: '#FF6539', marginRight: 8 }} />
                {leaveData.isPrivileged ? "วันหยุดประจำเดือน" : "หยุดประจำเดือน"} ({dayjs().format("MMM")})
              </Title>
            </div>
            <Tag color={leaveData.remainingQuota >= 0 ? "success" : "error"}>
              เหลือ {leaveData.remainingQuota} วัน
            </Tag>
          </div>

          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <Statistic title="โควต้าเดือนนี้" value={leaveData.monthlyQuota} suffix="วัน" valueStyle={{ fontSize: 18 }} />
              <div style={{ marginTop: 5, fontSize: 12, color: '#666' }}>
                {leaveData.isPrivileged ? "เสาร์-อาทิตย์ + นักขัตฤกษ์" : "โควต้าตามระเบียบ"}
              </div>
              <div style={{ height: 8 }} />
              <Statistic title="ใช้ไปแล้ว" value={leaveData.usedLeaveMonth} suffix="วัน" valueStyle={{ color: '#faad14', fontSize: 20 }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Progress type="circle" percent={percent} width={90} strokeColor={leaveData.remainingQuota >= 0 ? "#52c41a" : "#ff4d4f"} format={() => <div style={{ fontSize: 12, color: '#666' }}>ใช้ไป<br /><span style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>{leaveData.usedLeaveMonth}</span></div>} />
            </div>
          </div>

          <Divider style={{ margin: '15px 0' }} />
          <Button type="dashed" block onClick={() => setIsModalOpen(true)} icon={<FileTextOutlined />}>ดูประวัติการหยุด</Button>
        </Card>

        {/* Card 2: วันพักร้อน */}
        <Card bordered={false} style={{ borderRadius: 16, marginBottom: 20, background: "linear-gradient(to right, #e6f7ff, #ffffff)" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CrownOutlined style={{ color: '#1890ff' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>สิทธิ์พักร้อนสะสม</Text>
              </div>
              <Title level={3} style={{ margin: "5px 0", color: "#1890ff" }}>
                {Math.max(0, leaveData.annualLeaveTotal - leaveData.annualLeaveUsed)}
                <span style={{ fontSize: 16, fontWeight: 400, color: '#999' }}> / {leaveData.annualLeaveTotal} วัน</span>
              </Title>
              {leaveData.workDuration.years < 1 ? (
                <Text type="danger" style={{ fontSize: 10 }}>*อายุงานยังไม่ครบ 1 ปี</Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 10 }}>
                  (สิทธิ์ตามอายุงาน {leaveData.workDuration.years} ปี)
                </Text>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>ใช้ไป</Text>
              <div style={{ fontSize: 20, color: '#1890ff', fontWeight: 'bold' }}>{leaveData.annualLeaveUsed}</div>
            </div>
          </div>
        </Card>

        {/* Card 3: วันหยุดชดเชยสะสม (แสดงเฉพาะคนที่มีสิทธิ์) */}
       {leaveData.isSalesOrTransport && (
  <Card
    bordered={false}
    style={{
      borderRadius: 16,
      marginBottom: 20,
      background: '#f9f0ff',
      border: '1px solid #d3adf7',
      padding: 20,
    }}
  >
    <Title level={5} style={{ margin: 0, color: '#722ed1' }}>
      <FieldTimeOutlined /> วันหยุดชดเชย (Compensatory Leave)
    </Title>

    <div style={{ marginTop: 10 }}>
      <Text strong style={{ fontSize: 16, color: '#722ed1' }}>
        สะสมทั้งหมด: {leaveData.compensatory.totalEarned} วัน
      </Text>

      <div style={{ marginTop: 6, fontSize: 14 }}>
        <Text type="secondary">
          ใช้ไปแล้ว: <Text strong>{leaveData.compensatory.used}</Text> วัน
        </Text>
      </div>

      <div style={{ marginTop: 6, fontSize: 14 }}>
        <Text type="secondary">
          คงเหลือ: <Text strong>{leaveData.compensatory.remaining}</Text> วัน
        </Text>
      </div>

      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
        *ได้รับเมื่อสาขาวงษ์หิรัญหยุด แต่สาขาที่พนักงานประจำไม่ได้หยุด ในวันหยุดนักขัตฤกษ์
      </Text>
    </div>
  </Card>
)}


        {/* ปุ่มดูปฏิทินวันหยุด */}
        <div style={{ marginBottom: 20 }}>
          <Card bordered={false} style={{ borderRadius: 16, background: "linear-gradient(to right, #fffbe6, #ffffff)" }} onClick={() => setIsHolidayModalOpen(true)}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: 24 }}>📅</div>
              <div style={{ flex: 1 }}>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>ปฏิทินวันหยุดบริษัท</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ตรวจสอบวันหยุดนักขัตฤกษ์ และวันหยุดตามสาขา
                </Text>
              </div>
              <div>»</div>
            </div>
          </Card>
        </div>

        <Button block size="large" type="primary" style={{ height: 50, borderRadius: 12, background: "#333" }} onClick={() => liff.closeWindow()}>ปิดหน้าต่าง</Button>
      </div>

      {/* Modal History */}
      <Modal
        title="ประวัติวันหยุด (เดือนนี้)"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        centered
        bodyStyle={{ maxHeight: '60vh', overflowY: 'auto' }}
      >
        <List
          itemLayout="horizontal"
          dataSource={historyList}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                avatar={<Avatar style={{ backgroundColor: '#fde3cf', color: '#f56a00' }} icon={<ClockCircleOutlined />} />}
                title={dayjs(item.date).format("DD MMMM YYYY")}
                description={<Tag color="blue">{item.status}</Tag>}
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* Modal วันหยุดนักขัตฤกษ์ */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>วันหยุดนักขัตฤกษ์</span>
            <Select
              value={selectedYear}
              onChange={setSelectedYear}
              style={{ width: 100 }}
              size="small"
            >
              {availableYears.map(year => (
                <Option key={year} value={year}>{year + 543}</Option>
              ))}
            </Select>
          </div>
        }
        open={isHolidayModalOpen}
        onCancel={() => setIsHolidayModalOpen(false)}
        footer={null}
        centered
        width={500}
        bodyStyle={{ maxHeight: '60vh', overflowY: 'auto' }}
      >
        <div style={{ marginBottom: 10, padding: '10px', background: '#f0f0f0', borderRadius: 8, textAlign: 'center' }}>
          <Text strong>รวม {filteredHolidays.length} วัน</Text>
        </div>

        <List
          itemLayout="horizontal"
          dataSource={filteredHolidays}
          locale={{ emptyText: 'ไม่มีข้อมูลวันหยุดในปีนี้' }}
          renderItem={(item) => {
            let isMyBranchOff = true;
            if (!item.targetBranches || item.targetBranches === "ALL" || (Array.isArray(item.targetBranches) && item.targetBranches.length === 0)) {
              isMyBranchOff = true;
            } else if (Array.isArray(item.targetBranches)) {
              isMyBranchOff = item.targetBranches.includes(myBranchId);
            }
            const isSales = employee?.department === "03";
            if (isMyBranchOff && isSales && !item.allowSales) {
              isMyBranchOff = false;
            }

            return (
              <List.Item style={{ opacity: isMyBranchOff ? 1 : 0.5 }}>
                <List.Item.Meta
                  avatar={<Avatar style={{ backgroundColor: isMyBranchOff ? '#fff1f0' : '#f0f0f0', color: isMyBranchOff ? '#ff4d4f' : '#ccc' }} icon={<CalendarOutlined />} />}
                  title={
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <Text style={{ textDecoration: isMyBranchOff ? 'none' : 'line-through' }}>{item.title}</Text>
                      {!isMyBranchOff && <Tag color="purple" style={{ width: 'fit-content', marginTop: 4 }}>ไม่หยุด (ได้ชดเชย)</Tag>}
                    </div>
                  }
                  description={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      <Text type="secondary">{dayjs(item.date).format("DD MMM")}</Text>
                      <Tag color="red">{dayjs(item.date).format("ddd")}</Tag>
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      </Modal>
    </div>
  );
}
