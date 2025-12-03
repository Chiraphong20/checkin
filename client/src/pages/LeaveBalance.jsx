import React, { useEffect, useState } from "react";
import { Card, Typography, Spin, message, Flex, Progress, Button, Modal, List, Avatar, Divider, Statistic, Tag } from "antd";
import { UserOutlined, CalendarOutlined, FileTextOutlined, ClockCircleOutlined } from "@ant-design/icons";
import liff from "@line/liff"; 
import { db } from "../firebase"; 
import { collection, query, where, getDocs } from "firebase/firestore"; 
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween"; 
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import "dayjs/locale/th";

// ตั้งค่าภาษาและ Plugin ให้ dayjs
dayjs.locale('th');
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;

// แผนก
const departments = [
  { code: "01", name: "ผู้บริหาร" },
  { code: "02", name: "Office" },
  { code: "03", name: "พนักงานขาย" },
  { code: "04", name: "พนักงานขนส่ง" },
];

export default function LeaveBalance() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  
  // State เก็บข้อมูลวันลาและโควต้า
  const [leaveData, setLeaveData] = useState({
    monthlyQuota: 0,      // โควต้าเดือนนี้
    accumulatedQuota: 0,  // โควต้าสะสม (ตั้งเป็น 0 เพื่อแก้ปัญหายอดพุ่ง)
    remainingQuota: 0,    // คงเหลือสุทธิ
    annualLeaveTotal: 0,  // สิทธิ์พักร้อนทั้งปี
    annualLeaveUsed: 0,   // พักร้อนที่ใช้ไป
    usedLeaveMonth: 0,    // ใช้ไปเดือนนี้ (วันหยุดทั่วไป)
    yearsOfService: 0,
    isPrivileged: false   // เป็น Office/Admin ไหม
  });
  
  const [historyList, setHistoryList] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: "2008408737-4x2nLQp8" }); // ตรวจสอบ LIFF ID ให้ถูกต้อง
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
        // ใช้รูปจาก LINE ถ้าไม่มีให้ใช้จาก DB
        empData.pictureUrl = profile.pictureUrl || empData.profileImage;
        setEmployee(empData);

        // 2. ดึงข้อมูลวันหยุดนักขัตฤกษ์
        const holidaysSnap = await getDocs(collection(db, "public_holidays"));
        const publicHolidays = holidaysSnap.docs.map(d => d.data().date);

        // 3. ดึงประวัติการลา/ขาด ทั้งหมดในปีนี้
        const currentYear = dayjs().format("YYYY");
        
        // ดึง Checkin (ขาด/สายมาก)
        const checkInQuery = query(collection(db, "employee_checkin"), where("employeeId", "==", empData.employeeId));
        const checkIns = (await getDocs(checkInQuery)).docs.map(d => d.data());

        // ดึง Leave (ใบลา)
        const leaveQuery = query(collection(db, "employee_leave"), where("employeeId", "==", empData.employeeId));
        const leaves = (await getDocs(leaveQuery)).docs.map(d => d.data());

        // --- ประมวลผลประวัติการลาทั้งหมด ---
        let allRecords = [];

        // A. จาก Checkin (หาเฉพาะวันที่ไม่ได้มาปกติ)
        checkIns.forEach(item => {
            const isOff = item.status && (
                item.status.includes("หยุด") || item.status.includes("ขาด") || 
                item.status.includes("สายมาก") || item.status.includes("ลา")
            );
            if (isOff && item.date.startsWith(currentYear)) {
                allRecords.push({ date: item.date, type: "checkin", status: item.status });
            }
        });

        // B. จาก Leave (แตกช่วงวันที่ลา เช่น ลา 3 วัน ก็แตกเป็น 3 record)
        leaves.forEach(l => {
            const start = dayjs(l.start || l.date);
            const end = dayjs(l.end || l.date);
            let curr = start;
            while(curr.isSameOrBefore(end, 'day')) {
                const dStr = curr.format("YYYY-MM-DD");
                if (dStr.startsWith(currentYear)) {
                    // ป้องกันข้อมูลซ้ำ (เผื่อ checkin กับ leave ชนกัน)
                    if (!allRecords.find(r => r.date === dStr)) {
                        allRecords.push({ 
                            date: dStr, 
                            type: "leave", 
                            status: l.type, // พักร้อน / ลากิจ / ลาป่วย
                            reason: l.reason 
                        });
                    }
                }
                curr = curr.add(1, 'day');
            }
        });

        // --- เริ่มคำนวณโควต้า ---
        const isOffice = ["01", "02"].includes(empData.department);
        const startWork = empData.startDate ? dayjs(empData.startDate) : dayjs();
        const yearsOfService = dayjs().diff(startWork, 'year', true);
        const currentMonthStr = dayjs().format("YYYY-MM");

        // 1. คำนวณพักร้อน (Annual Leave)
        let annualTotal = 0;
        let annualUsed = 0;

        // ทำงานครบ 1 ปี ถึงจะได้พักร้อน
        if (yearsOfService >= 1) {
            annualTotal = isOffice ? 6 : 11;
        }

        // นับยอดพักร้อนที่ใช้ไป
        annualUsed = allRecords.filter(r => r.status && r.status.includes("พักร้อน")).length;

        // 2. คำนวณวันหยุดรายเดือน (Monthly Leave)
        let monthlyQuota = 0;
        let accumulatedQuota = 0; 
        let usedMonth = 0;

        // ฟังก์ชันนับเสาร์อาทิตย์ในเดือน
        const countWeekends = (month) => {
            let count = 0;
            const daysInMonth = month.daysInMonth();
            for(let i=1; i<=daysInMonth; i++) {
                const d = month.date(i);
                const dayOfWeek = d.day(); // 0=Sun, 6=Sat
                if (dayOfWeek === 0 || dayOfWeek === 6) count++;
            }
            return count;
        };

        if (isOffice) {
            // === Office / Admin ===
            // โควต้า = จำนวนเสาร์อาทิตย์ในเดือนนี้
            monthlyQuota = countWeekends(dayjs());
            
            // การนับวันหยุดที่ใช้ (ไม่นับวันนักขัตฤกษ์)
            usedMonth = allRecords.filter(r => {
                const isThisMonth = r.date.startsWith(currentMonthStr);
                const isHoliday = publicHolidays.includes(r.date);
                const isVacation = r.status.includes("พักร้อน");
                // นับเฉพาะเดือนนี้ + ไม่ใช่นักขัตฤกษ์ + ไม่ใช่พักร้อน
                return isThisMonth && !isHoliday && !isVacation;
            }).length;

        } else {
            // === Sales / Transport (แก้ไขใหม่) ===
            // 🔥 เปลี่ยน Logic: คิดเฉพาะเดือนปัจจุบัน ไม่มีการสะสมจากเดือนก่อน
            // เพื่อแก้ปัญหาที่ระบบคิดว่าเดือนก่อนๆ ไม่ได้หยุดเลยแล้วทบมาจนยอดเวอร์ (54 วัน)
            
            const currentMonthIndex = dayjs().month(); // 0 = ม.ค., 11 = ธ.ค.
            
            // กุมภาพันธ์ (index 1) ได้ 4 วัน, เดือนอื่นๆ ได้ 5 วัน
            monthlyQuota = (currentMonthIndex === 1) ? 4 : 5; 
            
            // ตั้งค่าสะสมเป็น 0 
            accumulatedQuota = 0;

            // นับวันที่ใช้ไปในเดือนนี้ (ไม่รวมพักร้อน)
            usedMonth = allRecords.filter(r => 
                r.date.startsWith(currentMonthStr) && !r.status.includes("พักร้อน")
            ).length;
        }

        const remainingQuota = (monthlyQuota + accumulatedQuota) - usedMonth;

        // เตรียมข้อมูลประวัติสำหรับ Modal (เฉพาะเดือนนี้)
        const history = allRecords
            .filter(r => r.date.startsWith(currentMonthStr))
            .sort((a,b) => b.date.localeCompare(a.date));

        setLeaveData({
            monthlyQuota,
            accumulatedQuota,
            remainingQuota,
            annualLeaveTotal: annualTotal,
            annualLeaveUsed: annualUsed,
            usedLeaveMonth: usedMonth,
            yearsOfService: Math.floor(yearsOfService),
            isPrivileged: isOffice
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
  
  // Percent Calculation
  const totalAvailable = leaveData.monthlyQuota + leaveData.accumulatedQuota;
  const percent = totalAvailable > 0 ? (leaveData.usedLeaveMonth / totalAvailable) * 100 : 0;

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
                     
                     {/* แสดงบรรทัดสะสมเฉพาะกรณีที่มียอดสะสมจริงๆ หรือไม่ใช่ Office (แต่ตอนนี้เราปิดสะสม sales/transport ไว้จะแสดงเป็น 0) */}
                     {!leaveData.isPrivileged && leaveData.accumulatedQuota > 0 && (
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

        {/* Card 2: วันพักร้อน (Annual Leave) */}
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
    </div>
  );
}