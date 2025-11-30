import React, { useState } from "react";
import { Form, Input, Button, Card, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom"; 
import { db } from "../firebase"; // ✅ นำเข้า db
import { collection, query, where, getDocs } from "firebase/firestore"; // ✅ นำเข้าคำสั่ง Firestore

const Login = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    const { username, password } = values;
    setLoading(true);

    try {
      // 🔍 1. ค้นหาใน Collection "admins" ที่มี username ตรงกัน
      const q = query(collection(db, "admins"), where("username", "==", username));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // ❌ ไม่พบชื่อผู้ใช้
        message.error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
        setLoading(false);
        return;
      }

      // 🔐 2. ตรวจสอบรหัสผ่าน (Password)
      let isLoginSuccess = false;
      let adminData = null;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // เช็คว่า password ตรงกันไหม (ในระบบจริงควรเข้ารหัส แต่อันนี้เช็คตรงๆ เพื่อความง่าย)
        if (data.password === password) {
          isLoginSuccess = true;
          adminData = data;
        }
      });

      if (isLoginSuccess) {
        // ✅ เข้าสู่ระบบสำเร็จ
        message.success("เข้าสู่ระบบสำเร็จ");
        
        // ส่งข้อมูลผู้ใช้ไปที่ App.js (ใช้ชื่อจริงจาก DB หรือ Username)
        onLogin({ 
            name: adminData.name || username, 
            role: 'admin',
            uid: adminData.uid || 'admin-id' 
        });

        navigate("/dashboard"); 
      } else {
        // ❌ รหัสผ่านผิด
        message.error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      }

    } catch (error) {
      console.error("Login Error:", error);
      message.error("เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    }
    
    setLoading(false);
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f0f2f5",
      }}
    >
      <Card
        title="เข้าสู่ระบบผู้ดูแล (Admin)"
        variant="borderless"
        style={{ width: 350, textAlign: "center", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
      >
        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            label="ชื่อผู้ใช้"
            name="username"
            rules={[{ required: true, message: "กรุณากรอกชื่อผู้ใช้!" }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Username"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="รหัสผ่าน"
            name="password"
            rules={[{ required: true, message: "กรุณากรอกรหัสผ่าน!" }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              เข้าสู่ระบบ
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Login;