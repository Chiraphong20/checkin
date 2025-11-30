import React, { useEffect, useState } from "react";
import { Card, Typography, Spin, message, Button, Select, Input, Avatar, Tag, Divider, Row, Col } from "antd";
import { 
  UserOutlined, 
  PhoneOutlined, 
  IdcardOutlined, 
  ShopOutlined, 
  SafetyCertificateOutlined,
  SaveOutlined,
  ApartmentOutlined           
} from "@ant-design/icons";
import { db } from "../firebase";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import liff from "@line/liff";

const { Option } = Select;
const { Title, Text } = Typography;

export default function ProfileEmployee() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [profile, setProfile] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [phone, setPhone] = useState("");
const departmentMap = {
    "01": "กรรมการผู้บริหาร",
    "02": "Office",
    "03": "พนักงานขาย",
    "04": "พนักงานขนส่ง",
};
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: "2008408737-4x2nLQp8" });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const userProfile = await liff.getProfile();
        setProfile(userProfile);

        // ค้นหาพนักงานที่มี lineUserId ตรงกับผู้ใช้
        const q = query(collection(db, "employees"), where("lineUserId", "==", userProfile.userId));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const empData = snapshot.docs[0].data();
          setEmployee(empData);
        } else {
          // ถ้าไม่มี lineUserId ให้โหลดรายชื่อพนักงานทั้งหมด (ครั้งแรก) เพื่อให้เลือกผูกบัญชี
          const all = await getDocs(collection(db, "employees"));
          // กรองเอาเฉพาะคนที่ยังไม่มี lineUserId (ป้องกันการเลือกซ้ำ)
          const availableEmployees = all.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(emp => !emp.lineUserId); 
            
          setEmployees(availableEmployees);
        }
      } catch (error) {
        console.error(error);
        message.error("เกิดข้อผิดพลาดในการโหลดข้อมูล");
      } finally {
        setLoading(false);
      }
    };
    initLiff();
  }, []);

  const handleRegister = async () => {
    if (!selectedEmp || !phone) {
      return message.warning("กรุณาเลือกชื่อและกรอกเบอร์โทร");
    }
    setLoading(true);
    try {
      const userProfile = await liff.getProfile();
      const empDoc = doc(db, "employees", selectedEmp);
      await updateDoc(empDoc, {
        lineUserId: userProfile.userId,
        lineDisplayName: userProfile.displayName,
        pictureUrl: userProfile.pictureUrl, // บันทึกรูปจาก LINE ลงไปด้วย (ถ้าต้องการ)
        phone: phone,
        active: true,
      });
      message.success("เชื่อมบัญชี LINE กับพนักงานเรียบร้อยแล้ว!");
      window.location.reload();
    } catch (err) {
      console.error(err);
      message.error("ไม่สามารถบันทึกข้อมูลได้");
      setLoading(false);
    }
  };

  // --- 1. Loading View ---
  if (loading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        flexDirection: "column", 
        justifyContent: "center", 
        alignItems: "center", 
        background: "#f0f2f5" 
      }}>
        <Spin size="large" />
        <Text style={{ marginTop: 16, color: "#999" }}>กำลังโหลดข้อมูล...</Text>
      </div>
    );
  }

  // --- 2. Registration View (ยังไม่ผูก LINE) ---
  if (!employee && employees.length > 0) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #FF6539 0%, #FF8E6F 100%)",
        padding: "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <Card 
            bordered={false} 
            style={{ 
                width: "100%", 
                maxWidth: 400, 
                borderRadius: 20, 
                boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                textAlign: "center"
            }}
        >
          <SafetyCertificateOutlined style={{ fontSize: 48, color: "#FF6539", marginBottom: 16 }} />
          <Title level={4} style={{ color: "#333", marginBottom: 8 }}>ยืนยันตัวตนพนักงาน</Title>
          <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
            กรุณาเลือกชื่อของคุณเพื่อผูกบัญชี LINE
          </Text>

          <div style={{ textAlign: "left" }}>
              <Text strong style={{ marginBottom: 4, display: 'block' }}>ชื่อพนักงาน</Text>
              <Select
                showSearch
                placeholder="พิมพ์ชื่อเพื่อค้นหา..."
                optionFilterProp="children"
                size="large"
                style={{ width: "100%", marginBottom: 16 }}
                onChange={(v) => setSelectedEmp(v)}
                filterOption={(input, option) =>
                    option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                }
              >
                {employees.map((emp) => (
                  <Option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employeeId})
                  </Option>
                ))}
              </Select>

              <Text strong style={{ marginBottom: 4, display: 'block' }}>เบอร์โทรศัพท์</Text>
              <Input
                placeholder="กรอกเบอร์โทร 10 หลัก"
                size="large"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={10}
                prefix={<PhoneOutlined style={{ color: "#bfbfbf" }} />}
                style={{ marginBottom: 24 }}
                type="tel"
              />
          </div>

          <Button 
            type="primary" 
            block 
            size="large" 
            onClick={handleRegister}
            icon={<SaveOutlined />}
            style={{ 
                height: 48, 
                borderRadius: 12, 
                fontSize: 16, 
                fontWeight: "bold",
                background: "#FF6539",
                borderColor: "#FF6539"
            }}
          >
            ยืนยันการลงทะเบียน
          </Button>
        </Card>
      </div>
    );
  }

  // --- 3. No Data / Error View ---
  if (!employee) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center", 
        flexDirection: "column",
        padding: 20,
        background: "#f5f5f5"
      }}>
        <Title level={5}>ไม่พบข้อมูลพนักงาน</Title>
        <Text type="secondary">บัญชี LINE นี้ยังไม่ได้ลงทะเบียนในระบบ</Text>
        <Button style={{ marginTop: 20 }} onClick={() => liff.closeWindow()}>ปิดหน้าต่าง</Button>
      </div>
    );
  }

  // --- 4. Profile View (ข้อมูลพนักงาน) ---
  return (
    <div style={{
        minHeight: "100vh",
        background: "#f5f7fa",
        fontFamily: "'Sarabun', sans-serif"
    }}>
      {/* Header Background */}
      <div style={{
        background: "linear-gradient(135deg, #FF6539 0%, #ff9c7e 100%)",
        height: 180,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        position: "relative",
        boxShadow: "0 4px 15px rgba(255, 101, 57, 0.2)"
      }}>
        <div style={{ textAlign: "center", paddingTop: 30 }}>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 16 }}>ข้อมูลส่วนตัว</Text>
        </div>
      </div>

      {/* Main Content Card (Floating) */}
      <div style={{ padding: "0 20px", marginTop: -100 }}>
        
        {/* Profile Image */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
            <Avatar 
                size={110} 
                src={profile?.pictureUrl} 
                icon={<UserOutlined />}
                style={{ 
                    border: "5px solid white", 
                    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                    backgroundColor: "#fff",
                    color: "#FF6539"
                }} 
            />
        </div>

        {/* Info Card */}
        <Card 
            bordered={false}
            style={{ 
                borderRadius: 20, 
                boxShadow: "0 4px 25px rgba(0,0,0,0.05)",
                textAlign: "center",
                marginBottom: 20
            }}
        >
            <Title level={3} style={{ margin: "0 0 5px 0", color: "#333" }}>{employee.name}</Title>
            <div style={{ marginBottom: 20 }}>
                 <Tag color="orange" style={{ fontSize: 14, padding: "4px 10px", borderRadius: 12 }}>
                    {employee.employeeId || "-"}
                 </Tag>
            </div>
            
            <Divider style={{ margin: "15px 0" }} />

            <div style={{ textAlign: "left", padding: "0 10px" }}>
                {/* เบอร์โทร */}
                <Row align="middle" style={{ marginBottom: 15 }}>
                    <Col span={4}>
                        <div style={{ 
                            width: 40, height: 40, borderRadius: 12, 
                            background: "#FFF2E8", display: "flex", 
                            alignItems: "center", justifyContent: "center" 
                        }}>
                            <PhoneOutlined style={{ fontSize: 20, color: "#FF6539" }} />
                        </div>
                    </Col>
                    <Col span={20} style={{ paddingLeft: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>เบอร์โทรศัพท์</Text>
                        <div style={{ fontSize: 16, fontWeight: 500 }}>{employee.phone || "-"}</div>
                    </Col>
                </Row>

                {/* แผนก */}
<Row align="middle">
    {/* แผนก / สาขา */}
    <Col span={4}>
        <div style={{ 
            width: 40, height: 40, borderRadius: 12, 
            background: "#E6F7FF", display: "flex", 
            alignItems: "center", justifyContent: "center" 
        }}>
            <ShopOutlined style={{ fontSize: 20, color: "#1890ff" }} />
        </div>
    </Col>

    <Col span={20} style={{ paddingLeft: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>แผนก / สาขา</Text>
        <div style={{ fontSize: 16, fontWeight: 500 }}>
            {employee.branches && employee.branches.length > 0
                ? employee.branches.join(", ")
                : employee.branch || "-"}
        </div>
    </Col>

    {/* แผนก (ตามโค้ดที่คุณให้มา) */}
    <Col span={4} style={{ marginTop: 20 }}>
        <div style={{ 
            width: 40, height: 40, borderRadius: 12, 
            background: "#FFF7E6", display: "flex", 
            alignItems: "center", justifyContent: "center" 
        }}>
            <ApartmentOutlined style={{ fontSize: 20, color: "#FA8C16" }} />
        </div>
    </Col>

    <Col span={20} style={{ paddingLeft: 12, marginTop: 20 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>แผนก</Text>
        <div style={{ fontSize: 16, fontWeight: 500 }}>
            {departmentMap[employee.department] || "-"}
        </div>
    </Col>
</Row>


            </div>
        </Card>

        {/* Close Button */}
        <Button 
            block 
            size="large" 
            style={{ 
                height: 50, 
                borderRadius: 12, 
                fontWeight: "bold",
                background: "#333",
                color: "#fff",
                border: "none",
                marginBottom: 30
            }}
            onClick={() => liff.closeWindow()}
        >
            ปิดหน้าต่าง
        </Button>

      </div>
    </div>
  );
}