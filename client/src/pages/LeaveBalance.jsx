import React, { useEffect, useState } from "react";
import { Card, Typography, Spin, message, Flex, Progress, Button, Modal, List, Avatar, Divider, Statistic, Tag } from "antd";
import { UserOutlined, CalendarOutlined, FileTextOutlined, ClockCircleOutlined } from "@ant-design/icons";
import liff from "@line/liff"; 
import { db } from "../firebase"; 
import { collection, query, where, getDocs } from "firebase/firestore"; 
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween"; 
import isSameOrBefore from "dayjs/plugin/isSameOrBefore"; // ✅ เพิ่ม plugin นี้เพื่อวนลูปวัน
import "dayjs/locale/th";

dayjs.locale('th');
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;

const departments = [
  { code: "01", name: "ผู้บริหาร / กรรมการ" },
  { code: "02", name: "Office" },
  { code: "03", name: "พนักงานขาย" },
  { code: "04", name: "พนักงานขนส่ง" },
];

export default function LeaveBalance() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [leaveData, setLeaveData] = useState({
    monthlyLeave: 0,
    annualLeave: 0,
    usedLeave: 0,
    usedYearLeave: 0,
    monthlyLeaveQuota: 5,
    yearsOfService: 0,
    isPrivileged: false
  });
  const [historyList, setHistoryList] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: "2008408737-4x2nLQp8" });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const lineUserId = profile.userId;

        // 1. ดึงข้อมูลพนักงาน
        const q = query(collection(db, "employees"), where("lineUserId", "==", lineUserId));
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

        // 2. ดึงข้อมูล Check-in
        const checkInQuery = query(
          collection(db, "employee_checkin"),
          where("employeeId", "==", empData.employeeId)
        );
        const checkInSnap = await getDocs(checkInQuery);
        const checkIns = checkInSnap.docs.map((doc) => doc.data());

        // 3. ดึงข้อมูล Leave
        const leaveQuery = query(
          collection(db, "employee_leave"),
          where("employeeId", "==", empData.employeeId)
        );
        const leaveSnap = await getDocs(leaveQuery);
        const leaves = leaveSnap.docs.map((doc) => doc.data());

        // --- เริ่มการประมวลผล ---
        const currentYear = dayjs().format("YYYY");
        const currentMonth = dayjs().format("YYYY-MM");
        
        let mergedHistory = [];

        // A. แปลงข้อมูล Check-in (ขาด/สายมาก)
        checkIns.forEach(item => {
            const isAbnormal = item.status && (
                item.status.includes("หยุด") || 
                item.status.includes("ขาดงาน") || 
                item.status.includes("สายมาก") ||
                item.status.includes("พักร้อน") ||
                item.status.includes("ลา")
            );

            if (isAbnormal) {
                mergedHistory.push({
                    date: item.date,
                    status: item.status,
                    type: "checkin", 
                    details: item.checkinTime !== "-" ? `เวลา: ${item.checkinTime}` : "ไม่ได้ลงเวลา"
                });
            }
        });

        // B. แปลงข้อมูล Leave (ใบลาจาก Admin)
        leaves.forEach(leave => {
            // 🔥 แก้ไขจุดสำคัญ: รองรับทั้ง 'date' (Admin ลง) และ 'start/end' (ระบบเดิม)
            const startDateStr = leave.start || leave.date;
            // ถ้าไม่มี end ให้ถือว่าเป็นวันเดียวกับ start
            const endDateStr = leave.end || leave.date || startDateStr; 

            if (!startDateStr) return; // ข้ามถ้าไม่มีวันที่

            let curr = dayjs(startDateStr);
            const end = dayjs(endDateStr);

            // วนลูปเผื่อกรณีลาต่อเนื่องหลายวัน
            while (curr.isSameOrBefore(end, 'day')) {
                const dateStr = curr.format("YYYY-MM-DD");
                
                // เช็คว่าวันนั้นซ้ำกับ Check-in หรือไม่
                const exists = mergedHistory.find(h => h.date === dateStr);
                
                if (!exists) {
                    // กำหนดชื่อสถานะให้สวยงาม
                    let displayStatus = leave.type || "ลาหยุด";
                    if (leave.status === "Approved") displayStatus += " (อนุมัติ)";
                    else if (leave.status === "Pending") displayStatus += " (รออนุมัติ)";
                    
                    mergedHistory.push({
                        date: dateStr,
                        status: displayStatus,
                        type: "leave",
                        details: leave.reason || "บันทึกโดย Admin"
                    });
                }
                curr = curr.add(1, 'day');
            }
        });

        // เรียงลำดับวันที่ (ใหม่ -> เก่า)
        mergedHistory.sort((a, b) => b.date.localeCompare(a.date));

        // C. คำนวณยอด
        const currentMonthList = mergedHistory.filter(h => h.date.startsWith(currentMonth));
        const currentYearList = mergedHistory.filter(h => h.date.startsWith(currentYear));

        const usedLeave = currentMonthList.length;
        const usedYearLeave = currentYearList.length;
        
        const monthlyLeaveQuota = 5;
        const monthlyLeave = Math.max(0, monthlyLeaveQuota - usedLeave);
        
        // คำนวณวันพักร้อน (Logic เดิม)
        let baseAnnual = 0;
        let yearsOfService = 0;
        let isPrivileged = ["01", "02"].includes(empData.department);

        if (empData.startDate) {
            yearsOfService = dayjs().diff(dayjs(empData.startDate), 'year', true);
        }
        
        if (isPrivileged || yearsOfService >= 1) {
            baseAnnual = empData.department === "01" ? 15 : 11;
        }

        setLeaveData({
          monthlyLeave,
          annualLeave: baseAnnual + monthlyLeave,
          usedLeave,
          usedYearLeave,
          monthlyLeaveQuota,
          yearsOfService: Math.floor(yearsOfService),
          isPrivileged
        });

        setHistoryList(currentMonthList); 
        setLoading(false);

      } catch (err) {
        console.error(err);
        message.error("โหลดข้อมูลล้มเหลว");
        setLoading(false);
      }
    };

    initLiff();
  }, []);

  if (loading) return <div style={{ minHeight: "100vh", display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div>;
  if (!employee) return null;

  const departmentName = departments.find((d) => d.code === employee.department)?.name || "-";
  const monthlyPercent = (leaveData.usedLeave / leaveData.monthlyLeaveQuota) * 100;

  const getStatusColor = (status) => {
      const s = status || "";
      if (s.includes("ป่วย")) return "blue";
      if (s.includes("พักร้อน")) return "cyan";
      if (s.includes("กิจ")) return "green";
      if (s.includes("ขาด") || s.includes("สายมาก")) return "red";
      if (s.includes("รออนุมัติ")) return "orange";
      return "gold";
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
                <div style={{ marginTop: 4 }}><Tag color="gold" style={{ borderRadius: 10, border: 'none', color: '#874d00' }}>รหัส: {employee.employeeId}</Tag></div>
            </div>
        </Flex>
      </div>

      <div style={{ padding: "0 20px", marginTop: -35 }}>
        
        {/* Card: เดือนนี้ */}
        <Card bordered={false} style={{ borderRadius: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.05)", marginBottom: 20 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 15 }}>
                <Title level={5} style={{ margin: 0, color: '#333' }}><CalendarOutlined style={{ color: '#FF6539', marginRight: 8 }} />เดือน {dayjs().format("MMMM")}</Title>
                <Tag color={leaveData.monthlyLeave > 0 ? "success" : "error"}>เหลือ {leaveData.monthlyLeave} วัน</Tag>
            </Flex>
            <Flex align="center" justify="space-between" gap="large">
                <div style={{ flex: 1 }}>
                     <Statistic title="โควต้า" value={leaveData.monthlyLeaveQuota} suffix="วัน" valueStyle={{ fontSize: 20 }} />
                     <div style={{ height: 8 }} />
                     <Statistic title="ใช้ไปแล้ว" value={leaveData.usedLeave} suffix="วัน" valueStyle={{ color: '#faad14', fontSize: 20 }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                    <Progress type="circle" percent={monthlyPercent} width={90} strokeColor={leaveData.monthlyLeave > 0 ? "#52c41a" : "#ff4d4f"} format={(p) => <div style={{ fontSize: 12, color: '#666' }}>ใช้ไป<br/><span style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>{leaveData.usedLeave}</span></div>} />
                </div>
            </Flex>
            <Divider style={{ margin: '15px 0' }} />
            <Button type="dashed" block onClick={() => setIsModalOpen(true)} icon={<FileTextOutlined />}>ดูรายละเอียดวันลา</Button>
        </Card>

        {/* Card: สะสมรายปี */}
        <Card bordered={false} style={{ borderRadius: 16, marginBottom: 20, background: "linear-gradient(to right, #ffffff, #f0f5ff)" }}>
             <Flex justify="space-between" align="center">
                <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>วันพักร้อนสะสม</Text>
                    <Title level={3} style={{ margin: "5px 0", color: "#1890ff" }}>{leaveData.annualLeave} <span style={{ fontSize: 16, fontWeight: 400, color: '#999' }}>วัน</span></Title>
                    <Text type="secondary" style={{ fontSize: 10 }}>*ตามเงื่อนไขบริษัท</Text>
                </div>
                <Statistic title="ใช้ไปในปีนี้" value={leaveData.usedYearLeave} suffix="วัน" valueStyle={{ color: '#1890ff', fontSize: 20 }} />
             </Flex>
        </Card>

        <Button block size="large" type="primary" style={{ height: 50, borderRadius: 12, background: "#333" }} onClick={() => liff.closeWindow()}>ปิดหน้าต่าง</Button>
      </div>

      {/* Modal Details */}
      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalendarOutlined style={{ color: '#FF6539' }} /><span>ประวัติการลา (เดือนนี้)</span></div>}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={[<Button key="close" type="primary" onClick={() => setIsModalOpen(false)} style={{ background: '#333' }}>ปิด</Button>]}
        centered
        width={350}
        bodyStyle={{ maxHeight: '60vh', overflowY: 'auto' }}
      >
        {historyList.length > 0 ? (
          <List
            itemLayout="horizontal"
            dataSource={historyList}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<Avatar style={{ backgroundColor: item.type === 'checkin' ? '#fff1f0' : '#e6f7ff', color: item.type === 'checkin' ? '#f5222d' : '#1890ff' }} icon={item.type === 'checkin' ? <ClockCircleOutlined /> : <FileTextOutlined />} />}
                  title={dayjs(item.date).format("DD MMMM YYYY")}
                  description={
                      <div style={{ marginTop: 4 }}>
                          <Tag color={getStatusColor(item.status)}>{item.status}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{item.details}</Text>
                      </div>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#999" }}>
            <CalendarOutlined style={{ fontSize: 40, marginBottom: 10, color: "#d9d9d9" }} />
            <p>ยังไม่มีประวัติการลาในเดือนนี้</p>
          </div>
        )}
      </Modal>
    </div>
  );
}