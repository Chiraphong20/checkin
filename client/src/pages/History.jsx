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
  
  // State สำหรับเก็บข้อมูลวันหยุดและสาขา
  const [holidays, setHolidays] = useState([]); 
  const [branchMap, setBranchMap] = useState({}); // Map: ชื่อสาขา -> ID สาขา

  const [selectedMonth, setSelectedMonth] = useState(dayjs());
  const [fetching, setFetching] = useState(false);

  const getStatusColor = (value) => {
    const v = typeof value === "string" ? value : "";
    if (v.includes("วันหยุด")) return "purple"; // สีม่วงสำหรับวันหยุด
    if (v.includes("หยุด")) return "red";       // สีแดงสำหรับหยุดปกติ/ขาดงาน
    if (v.includes("สาย")) return "orange";
    return "green";
  };

  useEffect(() => {
    const initData = async () => {
      try {
        // 1. โหลดข้อมูลสาขา (เพื่อเช็คเงื่อนไขวันหยุดรายสาขา)
        const branchSnap = await getDocs(collection(db, "branches"));
        const bMap = {};
        branchSnap.docs.forEach(doc => {
            if (doc.data().name) {
                bMap[doc.data().name] = doc.id;
            }
        });
        setBranchMap(bMap);

        // 2. โหลดข้อมูลวันหยุดทั้งหมด
        const holidaySnap = await getDocs(collection(db, "public_holidays"));
        const holidayData = holidaySnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setHolidays(holidayData);

        // 3. เริ่มต้น LIFF
        await liff.init({ liffId: "2008408737-4x2nLQp8" });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const lineUserId = profile.userId;

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

        // โหลดประวัติ (เดือนปัจจุบัน)
        fetchCheckInHistory(empData.employeeId, dayjs().startOf('month'), dayjs().endOf('month'));

      } catch (err) {
        console.error(err);
        message.error("เกิดข้อผิดพลาดในการโหลดข้อมูล");
        setLoading(false);
      }
    };

    initData();
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

  const handleMonthChange = (date) => {
    if (date) {
        setSelectedMonth(date);
        fetchCheckInHistory(employee.employeeId, date.startOf('month'), date.endOf('month'));
    }
  };

  // ✅ ฟังก์ชันเช็ควันหยุด
  const checkHolidayStatus = (record) => {
      // 1. หาว่าวันนั้นมีวันหยุดในระบบไหม
      const holiday = holidays.find(h => h.date === record.date);
      
      if (holiday) {
          // 2. ถ้ามี เช็คเงื่อนไขสาขา (targetBranches)
          const recordBranchId = branchMap[record.branch];
          
          const isTargetBranch = 
              !holiday.targetBranches || 
              holiday.targetBranches === "ALL" || 
              holiday.targetBranches.length === 0 || 
              (recordBranchId && Array.isArray(holiday.targetBranches) && holiday.targetBranches.includes(recordBranchId));

          if (isTargetBranch) {
              return { isHoliday: true, holidayName: holiday.title };
          }
      }
      return { isHoliday: false };
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", paddingTop: 100 }}>
        <Spin size="large" tip="กำลังโหลดข้อมูล..." />
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 600,
        minHeight: "100vh",
        margin: "0 auto",
        padding: "20px 15px",
        background: "linear-gradient(180deg, #FF6539 0%, #FF8E6F 100%)",
        minHeight: "100vh"
      }}
    >
      {/* Filter Section */}
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
            <DatePicker
                picker="month"
                format="MMMM YYYY"
                value={selectedMonth}
                onChange={handleMonthChange}
                inputReadOnly
                allowClear={false}
                style={{ flex: 1, height: 45, borderRadius: 8, fontSize: 16 }}
                placeholder="เลือกเดือน"
            />
            <Button 
                type="primary"
                onClick={() => handleMonthChange(selectedMonth)}
                loading={fetching}
                style={{ height: 45, width: 45, borderRadius: 8, background: '#333', borderColor: '#333' }}
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
            {records.map((r, index) => {
              // 🔥 ตรวจสอบวันหยุด
              const { isHoliday, holidayName } = checkHolidayStatus(r);
              
              // ถ้าเป็นวันหยุด ให้แสดงชื่อวันหยุด
              const displayStatus = isHoliday ? `วันหยุด (${holidayName})` : (r.status || "-");
              
              // เปลี่ยนสีถ้าเป็นวันหยุด
              const displayColor = isHoliday ? "purple" : getStatusColor(r.status);

              return (
                <div
                  key={index}
                  style={{
                    borderRadius: 12,
                    padding: 16,
                    backgroundColor: "#FFF",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    borderLeft: `5px solid ${displayColor}`
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text strong style={{ fontSize: 16 }}>
                      {dayjs(r.date).format("DD MMM YYYY")}
                    </Text>
                    <Tag color={displayColor} style={{ margin: 0, borderRadius: 4 }}>
                      {displayStatus}
                    </Tag>
                  </div>
                  
                  <div style={{ display: "flex", justifyContent: "space-between", color: '#666', fontSize: 14 }}>
                    <div>
                      <span>⏰ {r.checkinTime || "-"}</span>
                      <span style={{ margin: '0 8px' }}>|</span>
                      <span>📍 {r.branch || "-"}</span>
                    </div>
                    {/* ✅ แก้ไข: แสดงค่าปรับเฉพาะเมื่อ r.fine > 0 และ "ไม่ใช่" วันหยุด */}
                    {r.fine > 0 && !isHoliday && (
                      <Text type="danger" strong>ปรับ {r.fine}฿</Text>
                    )}
                    {/* กรณีเป็นวันหยุด จะไม่แสดงค่าปรับเลย แม้ใน DB จะมีค่าก็ตาม */}
                  </div>
                </div>
              );
            })}
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