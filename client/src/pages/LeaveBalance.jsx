import React, { useEffect, useState } from "react";
import { 
  Typography, Spin, message, Progress, Button, Modal, List, Avatar, Tag, Select, Divider
} from "antd";
import { 
  UserOutlined, CalendarOutlined, ClockCircleOutlined, 
  FieldTimeOutlined, CrownOutlined, WarningOutlined, RightOutlined, 
  CheckCircleFilled, CloseCircleFilled, HistoryOutlined
} from "@ant-design/icons";
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

// --- Components ย่อยเพื่อความสวยงาม (Modern UI) ---
const StatCard = ({ title, value, total, unit, color, icon, subtext }) => (
  <div style={{ 
    background: '#fff', 
    borderRadius: '20px', 
    padding: '20px', 
    marginBottom: '16px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
    position: 'relative',
    overflow: 'hidden'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ 
            background: `${color}15`, 
            padding: '8px', 
            borderRadius: '12px', 
            color: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {icon}
          </div>
          <Text style={{ color: '#888', fontSize: '14px', fontWeight: 500 }}>{title}</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontSize: '28px', fontWeight: '700', color: '#333' }}>{value}</Text>
          {total !== undefined && <Text style={{ fontSize: '14px', color: '#ccc' }}>/ {total}</Text>}
          <Text style={{ fontSize: '14px', color: '#888' }}>{unit}</Text>
        </div>
        {subtext && <Text style={{ fontSize: '12px', color: color, marginTop: 4, display: 'block' }}>{subtext}</Text>}
      </div>
      
      {total !== undefined && total > 0 && (
        <Progress 
          type="circle" 
          percent={(value / total) * 100} 
          width={60} 
          strokeColor={color} 
          trailColor="#f5f5f5"
          format={() => <span style={{ color: color, fontSize: 10 }}>{(value / total * 100).toFixed(0)}%</span>}
        />
      )}
    </div>
  </div>
);

const MenuButton = ({ icon, title, subtitle, onClick, color }) => (
  <div 
    onClick={onClick}
    style={{ 
      background: '#fff', 
      borderRadius: '16px', 
      padding: '16px', 
      marginBottom: '12px',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
      cursor: 'pointer',
      border: '1px solid #f0f0f0'
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ 
        width: 45, height: 45, borderRadius: '12px', 
        background: `linear-gradient(135deg, ${color} 0%, ${color}80 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: '20px', boxShadow: `0 4px 10px ${color}40`
      }}>
        {icon}
      </div>
      <div>
        <Text style={{ fontSize: '16px', fontWeight: '600', display: 'block' }}>{title}</Text>
        <Text style={{ fontSize: '12px', color: '#999' }}>{subtitle}</Text>
      </div>
    </div>
    <RightOutlined style={{ color: '#ddd' }} />
  </div>
);

const departments = [
  { code: "01", name: "ผู้บริหาร" },
  { code: "02", name: "Office" },
  { code: "03", name: "พนักงานขาย" },
  { code: "04", name: "พนักงานขนส่ง" },
];

export default function LeaveBalance() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [branchMap, setBranchMap] = useState({});
  const [myBranchId, setMyBranchId] = useState(null);

  const [leaveData, setLeaveData] = useState({
    monthlyQuota: 0, accumulatedQuota: 0, remainingQuota: 0,
    annualLeaveTotal: 0, annualLeaveUsed: 0,
    usedLeaveMonth: 0, holidaysInMonth: 0, holidaysInYear: 0,
    workDuration: { years: 0, months: 0, days: 0 },
    isPrivileged: false, isSalesOrTransport: false,
    compensatory: { totalEarned: 0, used: 0, remaining: 0 },
    combinedLimit: { max: 0, used: 0, remaining: 0 }
  });

  const [historyList, setHistoryList] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allPublicHolidays, setAllPublicHolidays] = useState([]);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(dayjs().year());

  // --- Logic Functions ---
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

  const calculateCompensatory = (allHolidays = [], allLeaves = [], branchId, deptCode) => {
    const isSalesOrTransport = ["03", "04"].includes(deptCode);
    if (!isSalesOrTransport) return { totalEarned: 0, used: 0, remaining: 0 };

    const today = dayjs().startOf('day');
    const earnedDates = new Set();

    allHolidays.forEach(h => {
      if (!h || !h.date) return;
      const dateStr = h.date;
      if (!dayjs(dateStr).isBefore(today, 'day')) return;

      const target = (!h.targetBranches || h.targetBranches === "ALL" || (Array.isArray(h.targetBranches) && h.targetBranches.length === 0))
        ? "ALL" : h.targetBranches;

      if (target === "ALL") return;

      const branchStopped = Array.isArray(target) ? target.includes(branchId) : (String(target) === String(branchId));
      const isMyBranchStopped = branchStopped && !!h.allowSales ? true : (branchStopped && !h.allowSales ? false : branchStopped);
      const someBranchesStopped = Array.isArray(target) && target.length > 0;
      
      if (!isMyBranchStopped && someBranchesStopped) {
        earnedDates.add(dateStr);
      }
    });

    const earned = earnedDates.size;
    const used = Array.isArray(allLeaves) ? allLeaves.filter(l =>
      l.type === "หยุดชดเชย" && ["Approved", "Pending"].includes(l.status)
    ).length : 0;

    return { totalEarned: earned, used: used, remaining: Math.max(0, earned - used) };
  };

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: "2008408737-4x2nLQp8" });
        if (!liff.isLoggedIn()) { liff.login(); return; }
        const profile = await liff.getProfile();

        const branchesSnap = await getDocs(collection(db, "branches"));
        const bMap = {};
        branchesSnap.forEach(doc => {
          const data = doc.data();
          bMap[data.name] = doc.id;
        });
        setBranchMap(bMap);

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

        const currentBranchId = bMap[empData.branch] || empData.branch;
        setMyBranchId(currentBranchId);

        const holidaysSnap = await getDocs(collection(db, "public_holidays"));
        const holidaysData = holidaysSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.date.localeCompare(b.date));
        setAllPublicHolidays(holidaysData);

        // วันที่สาขาหยุด (สำหรับเช็ควันหยุด)
        const myHolidaysDates = holidaysData.filter(h => {
          if (["01", "02"].includes(empData.department)) return true;
          let isBranchOff = false;
          if (!h.targetBranches || h.targetBranches === "ALL" || (Array.isArray(h.targetBranches) && h.targetBranches.length === 0)) isBranchOff = true;
          else if (Array.isArray(h.targetBranches)) isBranchOff = h.targetBranches.includes(currentBranchId);
          if (isBranchOff && empData.department === "03" && !h.allowSales) isBranchOff = false;
          return isBranchOff;
        }).map(h => h.date);

        const currentYear = dayjs().format("YYYY");
        const currentMonthStr = dayjs().format("YYYY-MM");

        const checkInQuery = query(collection(db, "employee_checkin"), where("employeeId", "==", empData.employeeId));
        const checkIns = (await getDocs(checkInQuery)).docs.map(d => d.data());

        const leaveQuery = query(collection(db, "employee_leave"), where("employeeId", "==", empData.employeeId));
        const leavesSnap = await getDocs(leaveQuery);
        const leaves = leavesSnap.docs.map(d => d.data());

        // --- 🔥 จัดการประวัติ (Filter ออกถ้าเป็น Office แล้วขึ้นขาดงานในวันหยุด) ---
        let allRecords = [];
        checkIns.forEach(item => {
          const isOff = item.status && (item.status.includes("หยุด") || item.status.includes("ขาด") || item.status.includes("สายมา") || item.status.includes("ลา"));
          
          if (isOff && item.date.startsWith(currentYear)) {
             // ✅ เพิ่มเงื่อนไขพิเศษสำหรับ Office (02)
             if (empData.department === "02" && item.status === "ขาดงาน") {
                 const d = dayjs(item.date);
                 const isWeekend = d.day() === 0 || d.day() === 6; // 0=Sun, 6=Sat
                 const isPublicHoliday = myHolidaysDates.includes(item.date);
                 
                 // ถ้าขาดงานในวันหยุด -> ข้ามเลย ไม่ต้องโชว์ ไม่ต้องนับ
                 if (isWeekend || isPublicHoliday) return;
             }

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
        const employmentDate = empData.joinDate || empData.startDate || null;
        const workDuration = calculateWorkDuration(employmentDate);
        const annualTotal = getAnnualLeaveQuota(workDuration.years, empData.department);
        const annualUsedTotal = allRecords.filter(r => r.status && r.status.includes("พักร้อน") && r.leaveStatus === 'Approved').length;

        let monthlyQuota = 0, accumulatedQuota = 0, usedMonth = 0, combinedMax = 0, combinedUsed = 0;

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
          monthlyQuota = countWeekends(dayjs()) + holidaysInMonth;
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
        const compData = calculateCompensatory(holidaysData, leaves, currentBranchId, empData.department);
        const history = allRecords.filter(r => r.date.startsWith(currentMonthStr)).sort((a, b) => b.date.localeCompare(a.date));

        setLeaveData({
          monthlyQuota, accumulatedQuota, remainingQuota,
          annualLeaveTotal: annualTotal, annualLeaveUsed: annualUsedTotal,
          usedLeaveMonth: usedMonth, holidaysInMonth, holidaysInYear,
          workDuration, isPrivileged: isOffice, isSalesOrTransport,
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
  }, []);

  if (loading) return <div style={{ minHeight: "100vh", display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div>;
  if (!employee) return null;

  const departmentName = departments.find((d) => d.code === employee.department)?.name || "-";
  const filteredHolidays = allPublicHolidays.filter(h => h.date && h.date.startsWith(selectedYear.toString()));
  const availableYears = [...new Set(allPublicHolidays.map(h => h.date ? dayjs(h.date).year() : null).filter(Boolean))].sort((a, b) => b - a);
  const combinedPercent = leaveData.combinedLimit.max > 0 ? (leaveData.combinedLimit.used / leaveData.combinedLimit.max) * 100 : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Sarabun', sans-serif", paddingBottom: 40 }}>
      
      {/* Header Profile Section */}
      <div style={{ 
        background: "linear-gradient(135deg, #FF6539 0%, #FF9E7D 100%)", 
        padding: "40px 24px 70px 24px", 
        borderBottomLeftRadius: 36, 
        borderBottomRightRadius: 36,
        color: "white",
        boxShadow: "0 10px 30px -10px rgba(255, 101, 57, 0.4)"
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar 
            size={80} 
            src={employee.pictureUrl} 
            icon={<UserOutlined />}
            style={{ 
              border: '4px solid rgba(255,255,255,0.3)', 
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)' 
            }} 
          />
          <div>
            <Title level={3} style={{ color: '#fff', margin: 0, fontSize: '22px' }}>{employee.name}</Title>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Tag color="rgba(0,0,0,0.2)" style={{ border: 'none', color: '#fff', borderRadius: 20, padding: '2px 10px' }}>
                {departmentName}
              </Tag>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{employee.branch || "-"}</Text>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
              <ClockCircleOutlined style={{ marginRight: 5 }} /> 
              อายุงาน: {leaveData.workDuration.years} ปี {leaveData.workDuration.months} เดือน
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px", marginTop: -50 }}>
        
        {/* Warning Card for Sales Limit */}
        {leaveData.isSalesOrTransport && (
          <div style={{ background: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, border: '1px solid #FFECB3', boxShadow: '0 4px 15px rgba(255, 193, 7, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text strong style={{ color: '#FAAD14' }}><WarningOutlined /> ลิมิตการหยุดรวม</Text>
              <Text style={{ fontSize: 12, color: '#999' }}>สูงสุด {leaveData.combinedLimit.max} วัน</Text>
            </div>
            <Progress 
              percent={combinedPercent} 
              status={leaveData.combinedLimit.remaining === 0 ? "exception" : "active"}
              strokeColor={{ '0%': '#FFC107', '100%': '#FF9800' }}
              showInfo={false}
              size="small"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12 }}>
              <Text>ใช้ไป: {leaveData.combinedLimit.used} วัน</Text>
              <Text type={leaveData.combinedLimit.remaining === 0 ? "danger" : "secondary"}>คงเหลือ: {leaveData.combinedLimit.remaining} วัน</Text>
            </div>
          </div>
        )}

        {/* 1. Monthly Quota Card */}
        <StatCard 
          title={leaveData.isPrivileged ? "วันหยุดประจำเดือน" : "หยุดประจำเดือน"}
          icon={<CalendarOutlined />}
          color="#3B82F6"
          value={leaveData.remainingQuota}
          total={leaveData.monthlyQuota + leaveData.accumulatedQuota}
          unit="วันคงเหลือ"
          subtext={`ใช้ไปแล้ว ${leaveData.usedLeaveMonth} วัน`}
        />

        {/* 2. Annual Leave Card */}
        <StatCard 
          title="พักร้อนสะสม"
          icon={<CrownOutlined />}
          color="#F59E0B"
          value={Math.max(0, leaveData.annualLeaveTotal - leaveData.annualLeaveUsed)}
          total={leaveData.annualLeaveTotal}
          unit="วันคงเหลือ"
          subtext={`สิทธิ์ ${leaveData.annualLeaveTotal} วันต่อปี`}
        />

        {/* 3. Compensatory Leave Card (Sales Only) */}
        {leaveData.isSalesOrTransport && (
          <StatCard 
            title="หยุดชดเชยสะสม"
            icon={<FieldTimeOutlined />}
            color="#8B5CF6"
            value={leaveData.compensatory.remaining}
            unit="วันคงเหลือ"
            subtext={`ได้สะสม ${leaveData.compensatory.totalEarned} / ใช้ไป ${leaveData.compensatory.used}`}
          />
        )}

        <Divider style={{ borderColor: '#e5e7eb', margin: '24px 0' }}>เมนูเพิ่มเติม</Divider>

        {/* Action Buttons */}
        <MenuButton 
          title="ประวัติการลา" 
          subtitle="ดูรายการลาและการมาสายเดือนนี้" 
          icon={<HistoryOutlined />} 
          color="#10B981"
          onClick={() => setIsModalOpen(true)}
        />

        <MenuButton 
          title="ปฏิทินวันหยุด" 
          subtitle="ตรวจสอบวันหยุดประจำปีของบริษัท" 
          icon={<CalendarOutlined />} 
          color="#FF6539"
          onClick={() => setIsHolidayModalOpen(true)}
        />

        <Button block size="large" style={{ marginTop: 20, height: 50, borderRadius: 16, border: 'none', background: '#333', color: 'white', fontWeight: 600 }} onClick={() => liff.closeWindow()}>
          ปิดหน้าต่าง
        </Button>
      </div>

      {/* --- Modal ประวัติ --- */}
      <Modal
        title="ประวัติเดือนนี้"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        centered
        bodyStyle={{ maxHeight: '60vh', overflowY: 'auto', padding: '0 20px' }}
      >
        <List
          itemLayout="horizontal"
          dataSource={historyList}
          renderItem={(item) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ 
                  background: item.status?.includes('สาย') ? '#FFF2F0' : '#F6FFED', 
                  padding: 8, borderRadius: '50%', color: item.status?.includes('สาย') ? '#FF4D4F' : '#52C41A'
                }}>
                  {item.status?.includes('สาย') || item.status?.includes('ขาด') ? <CloseCircleFilled /> : <CheckCircleFilled />}
                </div>
                <div>
                  <Text strong style={{ display: 'block' }}>{dayjs(item.date).format("D MMM YYYY")}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.type === 'checkin' ? 'ลงเวลาเข้างาน' : 'ใบลางาน'}</Text>
                </div>
              </div>
              <Tag color={item.status?.includes('ปกติ') || item.status === 'Approved' ? 'green' : 'red'} style={{ borderRadius: 10 }}>
                {item.status}
              </Tag>
            </div>
          )}
        />
      </Modal>

      {/* --- Modal ปฏิทิน --- */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20 }}>
            <span>🌴 วันหยุดบริษัท</span>
            <Select value={selectedYear} onChange={setSelectedYear} size="small" style={{ width: 100 }}>
              {availableYears.map(y => <Option key={y} value={y}>{y + 543}</Option>)}
            </Select>
          </div>
        }
        open={isHolidayModalOpen}
        onCancel={() => setIsHolidayModalOpen(false)}
        footer={null}
        centered
        bodyStyle={{ maxHeight: '60vh', overflowY: 'auto', padding: '0' }}
      >
        <List
          dataSource={filteredHolidays}
          renderItem={(item) => {
            let isMyBranchOff = true;
            if (!item.targetBranches || item.targetBranches === "ALL" || (Array.isArray(item.targetBranches) && item.targetBranches.length === 0)) isMyBranchOff = true;
            else if (Array.isArray(item.targetBranches)) isMyBranchOff = item.targetBranches.includes(myBranchId);
            if (isMyBranchOff && employee?.department === "03" && !item.allowSales) isMyBranchOff = false;

            return (
              <div style={{ 
                padding: '16px 20px', 
                borderBottom: '1px solid #f5f5f5', 
                background: isMyBranchOff ? '#fff' : '#fafafa',
                opacity: isMyBranchOff ? 1 : 0.6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ 
                      display: 'flex', flexDirection: 'column', alignItems: 'center', 
                      background: isMyBranchOff ? '#FFF2F0' : '#eee', 
                      padding: '6px 12px', borderRadius: 8, minWidth: 60 
                    }}>
                      <span style={{ fontSize: 12, color: '#ff4d4f', fontWeight: 600 }}>{dayjs(item.date).format("MMM")}</span>
                      <span style={{ fontSize: 20, color: '#333', fontWeight: 700 }}>{dayjs(item.date).format("D")}</span>
                    </div>
                    <div>
                      <Text style={{ fontSize: 16, fontWeight: 600, display: 'block', textDecoration: isMyBranchOff ? 'none' : 'line-through', color: isMyBranchOff ? '#333' : '#999' }}>{item.title}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(item.date).format("dddd")}</Text>
                    </div>
                  </div>
                  {!isMyBranchOff && <Tag color="purple" style={{ borderRadius: 12 }}>ได้ชดเชย</Tag>}
                </div>
              </div>
            )
          }}
        />
      </Modal>
    </div>
  );
}