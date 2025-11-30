import React, { useEffect, useState } from "react";
import { Typography, DatePicker, Spin, message, Button, Tag, Empty } from "antd";
import liff from "@line/liff";
import { db } from "../firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import dayjs from "dayjs";
import "dayjs/locale/th";
import { SearchOutlined, CalendarOutlined } from "@ant-design/icons";

// ตั้งค่าภาษาไทยให้ dayjs
dayjs.locale("th");

const { Title, Text } = Typography;

const departments = [
  { code: "01", name: "แผนกผู้บริหาร / กรรมการ" },
  { code: "02", name: "Office" },
  { code: "03", name: "พนักงานขาย" },
  { code: "04", name: "พนักงานขนส่ง" },
];

export default function History() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [records, setRecords] = useState([]);
  
  // 📱 เปลี่ยนจากช่วงวันที่ เป็น "เดือนที่เลือก" (เริ่มต้นคือเดือนปัจจุบัน)
  const [selectedMonth, setSelectedMonth] = useState(dayjs());
  const [fetching, setFetching] = useState(false);

  const getStatusColor = (value) => {
    const v = typeof value === "string" ? value : "";
    if (v.includes("หยุด")) return "red";
    if (v.includes("สาย")) return "orange";
    return "green";
  };

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

        // 🔹 ดึงข้อมูลพนักงาน
        const q = query(collection(db, "employees"), where("lineUserId", "==", lineUserId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          message.error("ไม่พบข้อมูลพนักงานในระบบ");
          setLoading(false);
          return;
        }

        const empData = snapshot.docs[0].data();
        setEmployee(empData);
        setLoading(false);

        // โหลดข้อมูลครั้งแรก (เดือนปัจจุบัน)
        // ส่ง startOf และ endOf ของเดือนปัจจุบันไปค้นหา
        fetchCheckInHistory(empData.employeeId, dayjs().startOf('month'), dayjs().endOf('month'));
      } catch (err) {
        console.error(err);
        message.error("เกิดข้อผิดพลาดในการโหลดข้อมูล");
        setLoading(false);
      }
    };

    initLiff();
  }, []);

  const fetchCheckInHistory = async (employeeId, startDate, endDate) => {
    if (!employeeId) return;
    setFetching(true);
    try {
      const q = query(
        collection(db, "employee_checkin"),
        where("employeeId", "==", employeeId),
        orderBy("date", "desc")
      );
      const snap = await getDocs(q);

      const filtered = snap.docs
        .map((d) => d.data())
        .filter((d) => {
          const checkDate = dayjs(d.date);
          return (
            checkDate.isAfter(startDate.subtract(1, "minute")) &&
            checkDate.isBefore(endDate.add(1, "minute"))
          );
        });

      setRecords(filtered);
    } catch (err) {
      console.error(err);
      message.error("ไม่สามารถโหลดข้อมูลประวัติได้");
    }
    setFetching(false);
  };

  // 🔄 ฟังก์ชันเมื่อเปลี่ยนเดือน
  const handleMonthChange = (date) => {
    if (date) {
        setSelectedMonth(date);
        // เมื่อเลือกเดือน ให้ค้นหาตั้งแต่วันที่ 1 ถึง สิ้นเดือน ทันที
        fetchCheckInHistory(employee.employeeId, date.startOf('month'), date.endOf('month'));
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", paddingTop: 100 }}>
        <Spin size="large" tip="กำลังโหลดข้อมูล..." />
      </div>
    );
  }

  const departmentName =
    departments.find((d) => d.code === employee?.department)?.name || "-";

  return (
    <div
      style={{
        maxWidth: 600,
        minHeight: "100vh",
        margin: "0 auto", // ปรับ margin ให้ชิดขอบบนในมือถือ
        padding: "20px 15px", // ลด padding ด้านข้างเล็กน้อย
        background: "linear-gradient(180deg, #FF6539 0%, #FF8E6F 100%)", // เพิ่มลูกเล่นพื้นหลัง
        minHeight: "100vh"
      }}
    >
      {/* Header Profile Section */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ 
          
        }}>
        </div>
       
      </div>

      {/* Filter Section (Card) */}
      <div style={{ 
          background: 'white', 
          borderRadius: 16, 
          padding: 16, 
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          marginBottom: 20
      }}>
        <div style={{ marginBottom: 8, color: '#666', fontSize: 14 }}>
            <CalendarOutlined /> เลือกเดือนที่ต้องการดู
        </div>
        
        <div style={{ display: 'flex', gap: 10 }}>
            {/* ✅ ใช้ DatePicker แบบ Month Picker เพื่อความง่ายในมือถือ */}
            <DatePicker
                picker="month"
                format="MMMM YYYY"
                value={selectedMonth}
                onChange={handleMonthChange}
                inputReadOnly // ป้องกันคีย์บอร์ดเด้ง
                allowClear={false}
                style={{ 
                    flex: 1, 
                    height: 45, // ปุ่มใหญ่ขึ้น
                    borderRadius: 8,
                    fontSize: 16
                }}
                placeholder="เลือกเดือน"
            />
            {/* ปุ่ม Refresh (เผื่อต้องการกดเอง) */}
            <Button 
                type="primary"
                onClick={() => handleMonthChange(selectedMonth)}
                loading={fetching}
                style={{ 
                    height: 45, 
                    width: 45, 
                    borderRadius: 8,
                    background: '#333',
                    borderColor: '#333'
                }}
                icon={<SearchOutlined />}
            />
        </div>
      </div>

      {/* Result List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 5px' }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                ประวัติการเข้างาน ({records.length} รายการ)
            </Text>
        </div>

        {fetching ? (
          <div style={{ textAlign: 'center', padding: 20, background: 'rgba(255,255,255,0.2)', borderRadius: 12 }}>
            <Spin tip="กำลังค้นหา..." style={{ color: 'white' }} />
          </div>
        ) : records.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {records.map((r, index) => (
              <div
                key={index}
                style={{
                  borderRadius: 12,
                  padding: 16,
                  backgroundColor: "#FFF",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                  borderLeft: `5px solid ${getStatusColor(r.status)}` // แถบสีด้านซ้าย
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text strong style={{ fontSize: 16 }}>
                    {dayjs(r.date).format("DD MMM YYYY")}
                  </Text>
                  <Tag color={getStatusColor(r.status)} style={{ margin: 0, borderRadius: 4 }}>
                    {r.status || "-"}
                  </Tag>
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", color: '#666', fontSize: 14 }}>
                  <div>
                    <span>⏰ {r.checkinTime || "-"}</span>
                    <span style={{ margin: '0 8px' }}>|</span>
                    <span>📍 {r.branch || "-"}</span>
                  </div>
                  {r.fine > 0 && (
                     <Text type="danger" strong>ปรับ {r.fine}฿</Text>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 16, padding: 30, textAlign: 'center' }}>
             <Empty description="ไม่พบข้อมูลในเดือนนี้" />
          </div>
        )}
      </div>

      {/* Footer Button */}
      <div style={{ marginTop: 30, paddingBottom: 20 }}>
               <Button block size="large" type="primary" style={{ height: 50, borderRadius: 12, background: "#333" }} onClick={() => liff.closeWindow()}>ปิดหน้าต่าง</Button>
       
      </div>
    </div>
  );
}