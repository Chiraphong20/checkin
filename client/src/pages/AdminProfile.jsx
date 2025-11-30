import React, { useEffect, useState } from "react";
import { Card, Button, Spin, Typography, Row, Col, Divider, message, Modal, Form, Input, Upload, Avatar } from "antd";
import { EditFilled, SaveOutlined, UploadOutlined, UserOutlined, PhoneOutlined, MailOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";

const { Title, Text } = Typography;

// Base64 placeholder สีเทา
const placeholderImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgFfK8hUAAAAASUVORK5CYII=";

export default function AdminProfile() {
  const [loading, setLoading] = useState(true);
  const [adminData, setAdminData] = useState(null);
  const [adminDocId, setAdminDocId] = useState(null);

  // State สำหรับ Modal แก้ไขข้อมูลทั่วไป
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  
  // State สำหรับ Modal แก้ไขรหัสผ่าน
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm] = Form.useForm();
  const [savingPassword, setSavingPassword] = useState(false);

  const [previewImage, setPreviewImage] = useState("");

  const navigate = useNavigate();

  // 1️⃣ ดึงข้อมูล Admin
  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const storedUser = localStorage.getItem("admin_user");
        if (!storedUser) {
          navigate("/login");
          return;
        }

        const currentUser = JSON.parse(storedUser);
        const searchKey = currentUser.username || currentUser.name; 
        
        const q = query(collection(db, "admins"), where("username", "==", searchKey));
        const snapshot = await getDocs(q);

        let finalSnapshot = snapshot;
        if (snapshot.empty && currentUser.name) {
             const qName = query(collection(db, "admins"), where("name", "==", currentUser.name));
             finalSnapshot = await getDocs(qName);
        }

        if (!finalSnapshot.empty) {
          const docSnap = finalSnapshot.docs[0];
          setAdminData(docSnap.data());
          setAdminDocId(docSnap.id);
        } else {
          message.warning("ไม่พบข้อมูลโปรไฟล์ในฐานข้อมูล");
        }
      } catch (err) {
        console.error("Error fetching:", err);
        message.error("โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [navigate]);

  // 2️⃣ เปิด Modal แก้ไขข้อมูลทั่วไป
  const handleEditClick = () => {
    const currentPic = adminData.pictureUrl || "";
    setPreviewImage(currentPic);
    editForm.setFieldsValue({
      name: adminData.name || "",
      phone: adminData.phone || "",
      email: adminData.email || "",
      pictureUrl: currentPic
    });
    setIsEditModalOpen(true);
  };

  // 3️⃣ เปิด Modal แก้ไขรหัสผ่าน
  const handlePasswordEditClick = () => {
    passwordForm.resetFields();
    setIsPasswordModalOpen(true);
  };

  // 4️⃣ บันทึกข้อมูลทั่วไป
  const handleSave = async (values) => {
    if (!adminDocId) return;

    setSaving(true);
    try {
      const adminRef = doc(db, "admins", adminDocId);

      const dataToUpdate = {
        name: values.name || "",
        phone: values.phone || "",
        email: values.email || "",
        pictureUrl: values.pictureUrl || ""
      };

      await updateDoc(adminRef, dataToUpdate);

      setAdminData(prev => ({ ...prev, ...dataToUpdate }));

      const oldUser = JSON.parse(localStorage.getItem("admin_user") || "{}");
      localStorage.setItem("admin_user", JSON.stringify({
        ...oldUser,
        name: dataToUpdate.name,
        pictureUrl: dataToUpdate.pictureUrl
      }));

      message.success("บันทึกข้อมูลสำเร็จ");
      setIsEditModalOpen(false);
      window.location.reload(); 

    } catch (err) {
      console.error("Save error:", err);
      message.error("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // 5️⃣ บันทึกรหัสผ่านใหม่
  const handlePasswordSave = async (values) => {
    if (!adminDocId) return;
    
    setSavingPassword(true);
    try {
      const adminRef = doc(db, "admins", adminDocId);
      
      await updateDoc(adminRef, {
        password: values.newPassword
      });

      message.success("เปลี่ยนรหัสผ่านสำเร็จ");
      setIsPasswordModalOpen(false);
    } catch (err) {
      console.error("Password save error:", err);
      message.error("เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setSavingPassword(false);
    }
  };

  // ฟังก์ชันจัดการรูปภาพ
  const handleImageUpload = (file) => {
    const isLt500K = file.size / 1024 / 1024 < 0.5;
    if (!isLt500K) {
      message.error('รูปภาพต้องมีขนาดเล็กกว่า 500KB');
      return false;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result;
      setPreviewImage(base64);
      editForm.setFieldsValue({ pictureUrl: base64 });
    };
    return false;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Spin size="large" tip="กำลังโหลดข้อมูล..." />
      </div>
    );
  }

  if (!adminData) return null;

  return (
    <div style={{ padding: "20px", maxWidth: "1000px", margin: "0 auto" }}>
      
      {/* Header */}
      <div style={{
        background: "#E74C3C",
        padding: "15px 25px",
        borderRadius: "12px 12px 0 0",
        color: "white",
        fontSize: "20px",
        fontWeight: "bold",
        boxShadow: "0 4px 10px rgba(0,0,0,0.1)"
      }}>
        <UserOutlined style={{ marginRight: 10 }} /> ข้อมูลผู้ใช้
      </div>

      {/* Content Card */}
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "0 0 12px 12px",
        boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
        minHeight: "400px"
      }}>
        <Row gutter={[40, 40]}>
          
          {/* Profile Picture */}
          <Col xs={24} md={8} style={{ display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{
              border: "4px solid #eee",
              borderRadius: "12px",
              padding: "5px",
              width: "100%",
              maxWidth: "220px",
              aspectRatio: "3/4",
              overflow: "hidden",
              backgroundColor: "#f0f0f0"
            }}>
              <img
                src={adminData.pictureUrl || placeholderImage}
                alt="Profile"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                onError={(e) => { e.target.src = "https://via.placeholder.com/300x400?text=No+Image"; }}
              />
            </div>
          </Col>

          {/* Details */}
          <Col xs={24} md={16}>
            {/* ข้อมูลส่วนตัว */}
            <div style={{ marginBottom: "30px" }}>
              <Title level={4} style={{ marginBottom: "20px", color: "#333" }}>ข้อมูลส่วนตัว</Title>
              <Row style={{ marginBottom: "12px" }}>
                <Col span={8}><Text type="secondary" style={{ fontSize: "16px" }}>รหัสผู้ใช้งาน</Text></Col>
                <Col span={16}><Text strong style={{ fontSize: "16px" }}>{adminData.username}</Text></Col>
              </Row>
              <Row style={{ marginBottom: "12px" }}>
                <Col span={8}><Text type="secondary" style={{ fontSize: "16px" }}>ชื่อ-นามสกุล</Text></Col>
                <Col span={16}><Text strong style={{ fontSize: "16px" }}>{adminData.name}</Text></Col>
              </Row>
              <Row style={{ marginBottom: "12px" }}>
                <Col span={8}><Text type="secondary" style={{ fontSize: "16px" }}>ตำแหน่ง</Text></Col>
                <Col span={16}><Text strong style={{ fontSize: "16px" }}>ผู้ดูแลระบบ (Admin)</Text></Col>
              </Row>
            </div>

            <Divider />

            {/* ข้อมูลทั่วไป */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <Title level={4} style={{ margin: 0, color: "#333" }}>ข้อมูลทั่วไป</Title>
              <Button
                type="primary"
                icon={<EditFilled />}
                style={{ background: "#F39C12", borderColor: "#F39C12", borderRadius: "20px", fontWeight: "bold" }}
                onClick={handleEditClick}
              >
                แก้ไข
              </Button>
            </div>

            <Row style={{ marginBottom: "12px" }}>
              <Col span={8}><Text type="secondary" style={{ fontSize: "16px" }}><MailOutlined /> E-mail</Text></Col>
              <Col span={16}><Text style={{ fontSize: "16px" }}>{adminData.email || "-"}</Text></Col>
            </Row>
            <Row style={{ marginBottom: "12px" }}>
              <Col span={8}><Text type="secondary" style={{ fontSize: "16px" }}><PhoneOutlined /> โทรศัพท์</Text></Col>
              <Col span={16}><Text style={{ fontSize: "16px" }}>{adminData.phone || "-"}</Text></Col>
            </Row>

            <Divider />

            {/* รหัสผ่าน */}
            <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <Title level={4} style={{ marginBottom: "10px", color: "#333" }}>รหัสผ่าน</Title>
                    <Button 
                        type="primary" 
                        icon={<EditFilled />} 
                        style={{ background: "#F39C12", borderColor: "#F39C12", borderRadius: "20px", fontWeight: "bold" }}
                        onClick={handlePasswordEditClick}
                    >
                        แก้ไข
                    </Button>
                </div>
                <Row>
                    <Col span={24}><Text style={{ fontSize: "24px", letterSpacing: "4px", color: "#888" }}>••••••••••</Text></Col>
                </Row>
            </div>

          </Col>
        </Row>
      </div>

      {/* Modal แก้ไขข้อมูลทั่วไป */}
      <Modal
        title="แก้ไขข้อมูลส่วนตัว"
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleSave}>
          <Form.Item label="ชื่อ-นามสกุล" name="name" rules={[{ required: true, message: "กรุณากรอกชื่อ" }]}>
            <Input size="large" prefix={<UserOutlined />} />
          </Form.Item>

          <Form.Item label="E-mail" name="email">
            <Input size="large" prefix={<MailOutlined />} />
          </Form.Item>

          <Form.Item label="เบอร์โทรศัพท์" name="phone">
            <Input size="large" prefix={<PhoneOutlined />} />
          </Form.Item>

          <Form.Item label="รูปโปรไฟล์">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                {previewImage && (
                    <Avatar size={100} src={previewImage} style={{ marginBottom: 10, border: '2px solid #eee' }} />
                )}
                <Upload
                    beforeUpload={handleImageUpload}
                    showUploadList={false}
                    accept="image/png, image/jpeg, image/jpg"
                >
                    <Button icon={<UploadOutlined />}>เลือกรูปจากเครื่อง (Max 500KB)</Button>
                </Upload>
                <Form.Item name="pictureUrl" noStyle>
                    <Input type="hidden" />
                </Form.Item>
            </div>
          </Form.Item>

          <Button 
            type="primary" 
            htmlType="submit" 
            block 
            loading={saving} 
            icon={<SaveOutlined />} 
            style={{ marginTop: 20, height: 45, fontSize: 16, background: "#E74C3C", borderColor: "#E74C3C" }}
          >
            บันทึกข้อมูล
          </Button>
        </Form>
      </Modal>

      {/* Modal แก้ไขรหัสผ่าน */}
      <Modal
        title="เปลี่ยนรหัสผ่าน"
        open={isPasswordModalOpen}
        onCancel={() => setIsPasswordModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical" onFinish={handlePasswordSave}>
            <Form.Item 
                label="รหัสผ่านใหม่" 
                name="newPassword" 
                rules={[
                    { required: true, message: "กรุณากรอกรหัสผ่านใหม่" },
                    { min: 4, message: "รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร" }
                ]}
            >
                <Input.Password size="large" prefix={<LockOutlined />} placeholder="ระบุรหัสผ่านใหม่" />
            </Form.Item>

            <Form.Item 
                label="ยืนยันรหัสผ่านใหม่" 
                name="confirmPassword" 
                dependencies={['newPassword']}
                rules={[
                    { required: true, message: "กรุณายืนยันรหัสผ่าน" },
                    ({ getFieldValue }) => ({
                        validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) {
                                return Promise.resolve();
                            }
                            return Promise.reject(new Error('รหัสผ่านไม่ตรงกัน'));
                        },
                    }),
                ]}
            >
                <Input.Password size="large" prefix={<LockOutlined />} placeholder="ยืนยันรหัสผ่านอีกครั้ง" />
            </Form.Item>
            
            <Button 
                type="primary" 
                htmlType="submit" 
                block 
                loading={savingPassword} 
                icon={<SaveOutlined />} 
                style={{ marginTop: 20, height: 45, fontSize: 16, background: "#E74C3C", borderColor: "#E74C3C" }}
            >
                บันทึกรหัสผ่าน
            </Button>
        </Form>
      </Modal>

    </div>
  );
}