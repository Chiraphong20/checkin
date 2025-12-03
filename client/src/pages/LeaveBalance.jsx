import React, { useEffect, useState } from "react";
import { Card, Typography, Spin, message, Flex, Progress, Button, Modal, List, Avatar, Divider, Statistic, Tag } from "antd";
import { UserOutlined, CalendarOutlined, FileTextOutlined, ClockCircleOutlined, StarFilled } from "@ant-design/icons";
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

const departments = [
  { code: "01", name: "ผู้บริหาร" },
  { code: "02", name: "Office" },
  { code: "03", name: "พนักงานขาย" },
  { code: "04", name: "พนักงานขนส่ง" },
];

export default function LeaveBalance() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  
  const [leaveData, setLeaveData] = useState({
    monthlyQuota: 0,
    accumulatedQuota: 0,
    remainingQuota: 0,
    annualLeaveTotal: 0,
    annualLeaveUsed: 0,
    usedLeaveMonth: 0,
    yearsOfService: 0,
    isPrivileged: false
  });
  
  const [historyList, setHistoryList] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: "2008408737-4x2nLQp8" });
        if (!liff.isLoggedIn()) { liff.login(); return; }
        const profile = await liff.getProfile();
        
        // 1. ดึงข้อมูลพนักงาน
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

        const isOffice = ["01", "02"].includes(empData.department);

        // 2. ดึงข้อมูลวันหยุดนักขัตฤกษ์
        const holidaysSnap = await getDocs(collection(db, "public_holidays"));
        const publicHolidaysData = holidaysSnap.docs.map(d => d.data()); // { date, title }

        // 3. ดึงประวัติการลา/ขาด (รายปี)
        const currentYear = dayjs().format("YYYY");
        
        const checkInQuery = query(collection(db, "employee_checkin"), where("employeeId", "==", empData.employeeId));
        const checkIns = (await getDocs(checkInQuery)).docs.map(d => d.data());

        const leaveQuery = query(collection(db, "employee_leave"), where("employeeId", "==", empData.employeeId));
        const leaves = (await getDocs(leaveQuery)).docs.map(d => d.data());

        let allRecords = [];

        // A. จาก Checkin
        checkIns.forEach(item => {
            const isOff = item.status && (
                item.status.includes("หยุด") || item.status.includes("ขาด") || 
                item.status.includes("สายมาก") || item.status.includes("ลา")
            );
            if (isOff && item.date.startsWith(currentYear)) {
                allRecords.push({ date: item.date, type: "checkin", status: item.status });
            }
        });

        // B. จาก Leave
        leaves.forEach(l => {
            const start = dayjs(l.start || l.date);
            const end = dayjs(l.end || l.date);
            let curr = start;
            while(curr.isSameOrBefore(end, 'day')) {
                const dStr = curr.format("YYYY-MM-DD");
                if (dStr.startsWith(currentYear)) {
                    if (!allRecords.find(r => r.date === dStr)) {
                        allRecords.push({ 
                            date: dStr, 
                            type: "leave", 
                            status: l.type, 
                            reason: l.reason 
                        });
                    }
                }
                curr = curr.add(1, 'day');
            }
        });

        // C. เพิ่มวันหยุดนักขัตฤกษ์ (เฉพาะ Office/Admin)
        if (isOffice) {
            publicHolidaysData.forEach(h => {
                if (h.date.startsWith(currentYear)) {
                    if (!allRecords.find(r => r.date === h.date)) {
                        allRecords.push({
                            date: h.date,
                            type: "holiday",
                            status: "วันหยุดนักขัตฤกษ์",
                            reason: h.title
                        });
                    }
                }
            });
        }

        // --- คำนวณโควต้า ---
        const startWork = empData.startDate ? dayjs(empData.startDate) : dayjs();
        const yearsOfService = dayjs().diff(startWork, 'year', true);
        const currentMonthStr = dayjs().format("YYYY-MM");

        // 1. พักร้อน (Annual Leave)
        let annualTotal = 0;
        let annualUsed = 0;
        if (yearsOfService >= 1) {
            annualTotal = isOffice ? 6 : 11;
        }
        annualUsed = allRecords.filter(r => r.status && r.status.includes("พักร้อน")).length;

        // 2. โควตารายเดือน (Monthly & Accumulated)
        let monthlyQuota = 0;
        let accumulatedQuota = 0; 
        let usedMonth = 0;

        if (isOffice) {
            // === Office / Admin (01, 02) ===
            // นับเสาร์-อาทิตย์
            const daysInMonth = dayjs().daysInMonth();
            for(let i=1; i<=daysInMonth; i++) {
                const d = dayjs().date(i);
                if (d.day() === 0 || d.day() === 6) monthlyQuota++;
            }
            
            // นับที่ใช้จริง (ไม่รวมนักขัตฤกษ์/พักร้อน)
            usedMonth = allRecords.filter(r => {
                const isThisMonth = r.date.startsWith(currentMonthStr);
                const isHoliday = r.type === "holiday"; 
                const isVacation = r.status.includes("พักร้อน");
                return isThisMonth && !isHoliday && !isVacation;
            }).length;

        } else {
            // === Sales / Transport (03, 04) ===
            // 🔥 กู้คืน Logic คำนวณสะสม (Loop ตั้งแต่มกราคม)
            const now = dayjs();
            let tempQuota = 0;

            for (let m = 0; m <= now.month(); m++) {
                const loopMonth = dayjs().month(m);
                const monthStr = loopMonth.format("YYYY-MM");
                
                // โควต้า: ก.พ. = 4, อื่นๆ = 5
                let q = (m === 1) ? 4 : 5; 
                
                // ใช้ไปเท่าไหร่ (ไม่รวมพักร้อน)
                const usedInLoop = allRecords.filter(r => 
                    r.date.startsWith(monthStr) && !r.status.includes("พักร้อน")
                ).length;

                if (m === now.month()) {
                    // เดือนปัจจุบัน
                    accumulatedQuota = tempQuota; // ยอดสะสมยกมา
                    monthlyQuota = q;             // ยอดใหม่เดือนนี้
                    usedMonth = usedInLoop;       // ใช้ไปเดือนนี้
                } else {
                    // เดือนก่อนหน้า: เหลือเท่าไหร่ทบไป
                    const remain = Math.max(0, q - usedInLoop);
                    tempQuota += remain;
                }
            }
        }

        const remainingQuota = (monthlyQuota + accumulatedQuota) - usedMonth;

        // ประวัติการลา (เดือนนี้)
        const history = allRecords
            .filter(r => r.date.startsWith(currentMonthStr))
            .sort((a,b) => dayjs(b.date).diff(dayjs(a.date))); 

        setLeaveData({
            monthlyQuota,
            accumulatedQuota,
            remainingQuota,
            annualLeaveTotal,
            annualLeaveUsed,
            usedLeaveMonth: usedMonth,
            yearsOfService: Math.floor(yearsOfService),
            isPrivileged: isOffice
        });
        
        setHistoryList(history);
        setLoading(false);

      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    initLiff();
  }, []);

  if (loading) return <div style={{ minHeight: "100vh", display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div>;
  if (!employee) return null;

  const departmentName = departments.find((d) => d.code === employee.department)?.name || "-";
  const totalAvailable = leaveData.monthlyQuota + leaveData.accumulatedQuota;
  const percent = totalAvailable > 0 ? (leaveData.usedLeaveMonth / totalAvailable) * 100 : 0;

  const getStatusInfo = (item) => {
      const status = item.status || "";
      if (item.type === "holiday") return { color: "purple", icon: <StarFilled />, text: item.reason || "วันหยุดนักขัตฤกษ์" };
      if (status.includes("ป่วย")) return { color: "blue", icon: <FileTextOutlined />, text: status };
      if (status.includes("พักร้อน")) return { color: "cyan", icon: <FileTextOutlined />, text: status };
      if (status.includes("กิจ")) return { color: "green", icon: <FileTextOutlined />, text: status };
      if (status.includes("ขาด") || status.includes("สายมาก")) return { color: "red", icon: <ClockCircleOutlined />, text: status };
      return { color: "orange", icon: <FileTextOutlined />, text: status };
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fa", paddingBottom: 40, fontFamily: "'Sarabun', sans-serif" }}>
      
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #FF6539 0%, #ff8e6f 100%)", padding: "30px 20px 50px 20px", borderBottomLeftRadius: 30, borderBottomRightRadius: 30, color: "white", boxShadow: "0 4px 15px rgba(255, 101, 57, 0.3)" }}>
        <Flex align="center" gap="middle">
            <Avatar size={70} icon={<UserOutlined />} src={employee.pictureUrl} style={{ backgroundColor: 'white', color: '#FF6539', border: '3px solid rgba(255,255,255,0.5)' }} />
            <div>
                <Title level={4} style={{ color: "white", margin: 0 }}>{employee.name}</Title>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{departmentName}</Text>
                <div style={{ marginTop: 4 }}><Tag color="gold" style={{ borderRadius: 10, border: 'none', color: '#874d00' }}>อายุงาน: {leaveData.yearsOfService} ปี</Tag></div>
            </div>
        </Flex>
      </div>

      <div style={{ padding: "0 20px", marginTop: -35 }}>
        
        {/* Card 1: วันหยุดเดือนนี้ */}
        <Card bordered={false} style={{ borderRadius: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.05)", marginBottom: 20 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 15 }}>
                <Title level={5} style={{ margin: 0, color: '#333' }}>
                    <CalendarOutlined style={{ color: '#FF6539', marginRight: 8 }} />
                    วันหยุดเดือนนี้ ({dayjs().format("MMMM")})
                </Title>
                <Tag color={leaveData.remainingQuota >= 0 ? "success" : "error"}>
                    เหลือ {leaveData.remainingQuota} วัน
                </Tag>
            </Flex>
            
            <Flex align="center" justify="space-between" gap="large">
                <div style={{ flex: 1 }}>
                     <Statistic 
                        title={leaveData.isPrivileged ? "โควต้า (เสาร์-อาทิตย์)" : "โควต้าเดือนนี้"} 
                        value={leaveData.monthlyQuota} 
                        suffix="วัน" 
                        valueStyle={{ fontSize: 18 }} 
                     />
                     {!leaveData.isPrivileged && (
                        <div style={{ marginTop: 5 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>+ สะสมยกมา: {leaveData.accumulatedQuota} วัน</Text>
                        </div>
                     )}
                     <div style={{ height: 8 }} />
                     <Statistic title="ใช้ไปแล้ว" value={leaveData.usedLeaveMonth} suffix="วัน" valueStyle={{ color: '#faad14', fontSize: 20 }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                    <Progress type="circle" percent={percent} width={90} strokeColor={leaveData.remainingQuota >= 0 ? "#52c41a" : "#ff4d4f"} format={() => <div style={{ fontSize: 12, color: '#666' }}>ใช้ไป<br/><span style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>{leaveData.usedLeaveMonth}</span></div>} />
                </div>
            </Flex>
            <Divider style={{ margin: '15px 0' }} />
            <Button type="dashed" block onClick={() => setIsModalOpen(true)} icon={<FileTextOutlined />}>ดูประวัติการหยุด</Button>
        </Card>

        {/* Card 2: พักร้อน */}
        <Card bordered={false} style={{ borderRadius: 16, marginBottom: 20, background: "linear-gradient(to right, #e6f7ff, #ffffff)" }}>
             <Flex justify="space-between" align="center">
                <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>สิทธิ์พักร้อนสะสม (ปีนี้)</Text>
                    <Title level={3} style={{ margin: "5px 0", color: "#1890ff" }}>
                        {Math.max(0, leaveData.annualLeaveTotal - leaveData.annualLeaveUsed)} 
                        <span style={{ fontSize: 16, fontWeight: 400, color: '#999' }}> / {leaveData.annualLeaveTotal} วัน</span>
                    </Title>
                    {leaveData.yearsOfService < 1 && (
                        <Text type="danger" style={{ fontSize: 10 }}>*ยังไม่ครบ 1 ปี ยังไม่มีสิทธิ์</Text>
                    )}
                </div>
                <div style={{ textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>ใช้ไป</Text>
                    <div style={{ fontSize: 20, color: '#1890ff', fontWeight: 'bold' }}>{leaveData.annualLeaveUsed}</div>
                </div>
             </Flex>
        </Card>

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
            renderItem={(item) => {
                const info = getStatusInfo(item);
                return (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Avatar 
                            style={{ 
                                backgroundColor: item.type === 'holiday' ? '#f9f0ff' : '#fff', 
                                color: info.color, 
                                border: `1px solid ${info.color}` 
                            }} 
                            icon={info.icon} 
                        />
                      }
                      title={dayjs(item.date).format("DD MMMM YYYY")}
                      description={
                          <div style={{ marginTop: 2 }}>
                              <Tag color={info.color}>{info.text}</Tag>
                              {item.type !== 'holiday' && item.reason && <Text type="secondary" style={{ fontSize: 12 }}>({item.reason})</Text>}
                          </div>
                      }
                    />
                  </List.Item>
                );
            }}
        />
      </Modal>
    </div>
  );
}