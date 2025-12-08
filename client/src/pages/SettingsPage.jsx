import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Form,
  Input,
  TimePicker,
  InputNumber,
  Switch,
  Button,
  message,
  Spin,
  Row,
  Col,
  Divider,
  Typography,
  Alert,
  Space,
  Tag,
  Select,
  Tabs // เพิ่ม Tabs เพื่อความสวยงามในการแยกกะ
} from "antd";
import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  DollarOutlined,
  SafetyOutlined,
  SaveOutlined,
  ReloadOutlined,
  FieldTimeOutlined,
  PoweroffOutlined
} from '@ant-design/icons';
import dayjs from "dayjs";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

const { Title, Text } = Typography;
const { Option } = Select;

export default function SettingsPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // State สำหรับจัดการสาขา
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  
  // State สำหรับเปิด/ปิด กะที่ 2
  const [enableShift2, setEnableShift2] = useState(false);

  // 1. โหลดรายชื่อสาขา
  const fetchBranches = useCallback(async () => {
    try {
      const branchSnap = await getDocs(collection(db, "branches"));
      const branchList = branchSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBranches(branchList);
      if (branchList.length > 0) {
        setSelectedBranchId(branchList[0].id);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
      message.error("โหลดรายชื่อสาขาไม่สำเร็จ");
    }
  }, []);

  // 2. โหลดค่าการตั้งค่า
  const fetchSettings = useCallback(async (branchId) => {
    if (!branchId) return;

    try {
      setLoading(true);
      
      // A. โหลด Global Settings
      const globalDocRef = doc(db, "settings", "checkin");
      const globalSnap = await getDoc(globalDocRef);
      let globalData = globalSnap.exists() ? globalSnap.data() : {};

      // B. โหลด Branch Time Settings
      const branchDocRef = doc(db, "branches", branchId);
      const branchSnap = await getDoc(branchDocRef);
      let branchData = branchSnap.exists() ? branchSnap.data() : {};

      // ตรวจสอบว่าเปิดกะ 2 ไว้หรือไม่
      const hasShift2 = branchData.hasShift2 || false;
      setEnableShift2(hasShift2);

      // Helper แปลงเวลา (รองรับข้อมูลเก่า startTime -> shift1_startTime)
      const getTime = (val, fallback) => val ? dayjs(val, "HH:mm") : (fallback ? dayjs(fallback, "HH:mm") : dayjs("00:00", "HH:mm"));

      form.setFieldsValue({
        // --- กะที่ 1 (ดึง shift1_... ถ้าไม่มีให้ดึงค่าเดิม startTime) ---
        shift1_startTime: getTime(branchData.shift1_startTime, branchData.startTime || "08:00"),
        shift1_lateAfter: getTime(branchData.shift1_lateAfter, branchData.lateAfter || "08:05"),
        shift1_lateThreshold1: getTime(branchData.shift1_lateThreshold1, branchData.lateThreshold1 || "08:15"),
        shift1_lateThreshold2: getTime(branchData.shift1_lateThreshold2, branchData.lateThreshold2 || "08:30"),
        shift1_checkoutTime: getTime(branchData.shift1_checkoutTime, branchData.checkoutTime || "16:00"),
        shift1_endTime: getTime(branchData.shift1_endTime, branchData.endTime || "17:00"),

        // --- กะที่ 2 (ค่า Default ถ้ายังไม่เคยตั้ง) ---
        hasShift2: hasShift2,
        shift2_startTime: getTime(branchData.shift2_startTime, "13:00"),
        shift2_lateAfter: getTime(branchData.shift2_lateAfter, "13:05"),
        shift2_lateThreshold1: getTime(branchData.shift2_lateThreshold1, "13:15"),
        shift2_lateThreshold2: getTime(branchData.shift2_lateThreshold2, "13:30"),
        shift2_checkoutTime: getTime(branchData.shift2_checkoutTime, "21:00"),
        shift2_endTime: getTime(branchData.shift2_endTime, "22:00"),
        
        // Global Settings
        lat: globalData.lat || "",
        lng: globalData.lng || "",
        radius: globalData.radius || 100,
        allowOutside: globalData.allowOutside || false,
        lateFine20: globalData.lateFine20 || 20,
        lateFine50: globalData.lateFine50 || 50,
        absentFine: globalData.absentFine || 50,
      });

    } catch (error) {
      console.error("Error loading settings:", error);
      message.error("โหลดการตั้งค่าล้มเหลว");
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    if (selectedBranchId) {
      fetchSettings(selectedBranchId);
    }
  }, [selectedBranchId, fetchSettings]);

  // 💾 ฟังก์ชันบันทึกการตั้งค่า
  const handleSave = async (values) => {
    if (!selectedBranchId) return message.error("กรุณาเลือกสาขาที่จะบันทึก");

    try {
      setSaving(true);
      
      const formatTime = (timeObj) => timeObj ? timeObj.format("HH:mm") : null;

      // Payload สำหรับ Branch
      const branchPayload = {
        // กะที่ 1
        shift1_startTime: formatTime(values.shift1_startTime),
        shift1_lateAfter: formatTime(values.shift1_lateAfter),
        shift1_lateThreshold1: formatTime(values.shift1_lateThreshold1),
        shift1_lateThreshold2: formatTime(values.shift1_lateThreshold2),
        shift1_checkoutTime: formatTime(values.shift1_checkoutTime),
        shift1_endTime: formatTime(values.shift1_endTime),
        
        // Config กะ 2
        hasShift2: enableShift2,

        // กะที่ 2 (บันทึกค่าแม้จะปิด switch เพื่อจำค่าเดิมไว้ แต่เวลาใช้งานจริงต้องเช็ค hasShift2)
        shift2_startTime: formatTime(values.shift2_startTime),
        shift2_lateAfter: formatTime(values.shift2_lateAfter),
        shift2_lateThreshold1: formatTime(values.shift2_lateThreshold1),
        shift2_lateThreshold2: formatTime(values.shift2_lateThreshold2),
        shift2_checkoutTime: formatTime(values.shift2_checkoutTime),
        shift2_endTime: formatTime(values.shift2_endTime),
      };

      // Payload สำหรับ Global
      const globalPayload = {
        lat: parseFloat(values.lat) || 0,
        lng: parseFloat(values.lng) || 0,
        radius: values.radius || 100,
        allowOutside: values.allowOutside || false,
        lateFine20: values.lateFine20 || 20,
        lateFine50: values.lateFine50 || 50,
        absentFine: values.absentFine || 50,
      };

      await setDoc(doc(db, "branches", selectedBranchId), branchPayload, { merge: true });
      await setDoc(doc(db, "settings", "checkin"), globalPayload, { merge: true });
      
      message.success(`บันทึกการตั้งค่าสาขา ${branches.find(b => b.id === selectedBranchId)?.name} เรียบร้อยแล้ว`);

    } catch (error) {
      console.error("Error saving settings:", error);
      message.error("เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    if (selectedBranchId) fetchSettings(selectedBranchId);
    message.info("รีเซ็ตค่า");
  };
  
  const currentBranchName = branches.find(b => b.id === selectedBranchId)?.name || "—";

  // Component สำหรับฟอร์มเวลา 1 กะ
  const ShiftForm = ({ prefix, label }) => (
    <Row gutter={[16, 0]}>
      <Col span={24}>
        <Divider orientation="left" style={{ margin: '10px 0', fontSize: '14px', color: '#1890ff' }}>
            <FieldTimeOutlined /> เวลาเข้างาน - เลิกงาน ({label})
        </Divider>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label={`เวลาเริ่มงาน ${label}`} name={`${prefix}_startTime`}>
          <TimePicker format="HH:mm" style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label={`เวลาเลิกงาน ${label}`} name={`${prefix}_endTime`}>
          <TimePicker format="HH:mm" style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label={`กำหนดว่าสายหลัง ${label}`} name={`${prefix}_lateAfter`}>
          <TimePicker format="HH:mm" style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label={`เวลาเช็คเอาท์ (อย่างน้อย) ${label}`} name={`${prefix}_checkoutTime`}>
          <TimePicker format="HH:mm" style={{ width: "100%" }} />
        </Form.Item>
      </Col>

      <Col span={24}>
        <Divider orientation="left" style={{ margin: '10px 0', fontSize: '14px', color: '#ff4d4f' }}>
            <SafetyOutlined /> เกณฑ์การสาย ({label})
        </Divider>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label={`เกณฑ์สาย (ระดับ 1) ${label}`} name={`${prefix}_lateThreshold1`}>
          <TimePicker format="HH:mm" style={{ width: "100%" }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label={`เกณฑ์สาย (ระดับ 2 / ขาด) ${label}`} name={`${prefix}_lateThreshold2`}>
          <TimePicker format="HH:mm" style={{ width: "100%" }} />
        </Form.Item>
      </Col>
    </Row>
  );

  return (
    <div style={{ padding: '0px', background: '#f5f5f5', minHeight: '100%' }}>
      <Card bordered={false} style={{ borderRadius: '12px', marginBottom: '24px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SafetyOutlined style={{ fontSize: '32px', color: '#1890ff' }} />
            การตั้งค่าระบบ (แยกกะ/สาขา)
          </Title>
          <Text type="secondary" style={{ fontSize: '16px' }}>จัดการเวลาทำงาน และค่าปรับต่างๆ</Text>
        </div>
        
        <Row align="middle" gutter={[16, 16]}>
            <Col><Text strong>เลือกสาขา:</Text></Col>
            <Col>
                <Select
                    style={{ width: 250 }}
                    value={selectedBranchId}
                    onChange={setSelectedBranchId}
                    size="large"
                    loading={branches.length === 0 && loading}
                    placeholder="กรุณาเลือกสาขา..."
                >
                    {branches.map(branch => (
                        <Option key={branch.id} value={branch.id}>{branch.name}</Option>
                    ))}
                </Select>
            </Col>
        </Row>
      </Card>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ background: '#f5f5f5' }}>
          <Row gutter={[24, 24]}>
            {/* --- ตั้งค่าเวลา (แยกกะ) --- */}
            <Col xs={24} lg={14}>
              <Card
                title={
                  <Space>
                    <ClockCircleOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                    <span style={{ fontSize: '18px', fontWeight: '600' }}>ตั้งค่าเวลา ({currentBranchName})</span>
                  </Space>
                }
                bordered={false}
                style={{ borderRadius: '12px', height: '100%' }}
                extra={
                    <Space>
                        <Text strong style={{ fontSize: 13 }}>ใช้งานกะที่ 2</Text>
                        <Switch 
                            checked={enableShift2} 
                            onChange={setEnableShift2}
                            checkedChildren={<PoweroffOutlined />}
                            unCheckedChildren={<PoweroffOutlined />}
                        />
                    </Space>
                }
              >
                <Tabs defaultActiveKey="1" type="card">
                    <Tabs.TabPane tab="กะที่ 1 (กะหลัก)" key="1">
                        <ShiftForm prefix="shift1" label="กะ 1" />
                    </Tabs.TabPane>
                    
                    <Tabs.TabPane 
                        tab={
                            <span>
                                กะที่ 2 {enableShift2 ? <Tag color="green">เปิด</Tag> : <Tag color="red">ปิด</Tag>}
                            </span>
                        } 
                        key="2"
                        disabled={!enableShift2}
                    >
                        {enableShift2 ? (
                            <ShiftForm prefix="shift2" label="กะ 2" />
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                                <PoweroffOutlined style={{ fontSize: 40, marginBottom: 10 }} />
                                <p>กะที่ 2 ปิดใช้งานอยู่</p>
                                <Button type="primary" onClick={() => setEnableShift2(true)}>เปิดใช้งาน</Button>
                            </div>
                        )}
                    </Tabs.TabPane>
                </Tabs>
                 <Row justify="space-between" align="middle">
              <Col>
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={handleReset} size="large" style={{ background: 'rgba(255,255,255,0.2)', borderColor: 'white', color: 'black' }}>ยกเลิก</Button>
                  <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />} size="large" disabled={!selectedBranchId} style={{ background: '#667eea', borderColor: 'white', color: 'white', fontWeight: 'bold' }}>บันทึกการตั้งค่า</Button>
                </Space>
              </Col>
            </Row>
              </Card>
            </Col>

            {/* --- Global Settings (ค่าปรับ & พิกัด) --- */}
            <Col xs={24} lg={10}>
                <Row gutter={[0, 24]}>
                    <Col span={24}>
                        <Card title={<Space><DollarOutlined style={{color: '#52c41a'}}/> ค่าปรับ (Global)</Space>} bordered={false} style={{ borderRadius: '12px' }}>
                            <Alert
                                message="ใช้กฎเดียวกันทุกสาขา/ทุกกะ"
                                type="info" showIcon style={{ marginBottom: '16px' }}
                            />
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item label="ค่าปรับสาย (ระดับ 1)" name="lateFine20">
                                        <InputNumber min={0} style={{ width: "100%" }} addonAfter="฿" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item label="ค่าปรับสาย (ระดับ 2)" name="lateFine50">
                                        <InputNumber min={0} style={{ width: "100%" }} addonAfter="฿" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item label="ค่าปรับหยุดงาน / สายเกินระดับ 2" name="absentFine">
                                        <InputNumber min={0} style={{ width: "100%" }} addonAfter="฿" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>
                 
                    </Col>

                    <Col span={24}>
                        <Card title={<Space><EnvironmentOutlined style={{color: '#ff4d4f'}}/> พิกัด & พื้นที่ (Global)</Space>} bordered={false} style={{ borderRadius: '12px' }}>
                            <Form.Item label="รัศมีอนุญาต (เมตร)" name="radius">
                                <InputNumber min={50} style={{ width: "100%" }} addonAfter="เมตร" />
                            </Form.Item>
                            <Form.Item label="อนุญาตให้นอกพื้นที่เช็คอิน" name="allowOutside" valuePropName="checked">
                                <Switch checkedChildren="อนุญาต" unCheckedChildren="ไม่อนุญาต" />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={12}><Form.Item label="Lat (Ref)" name="lat"><Input disabled /></Form.Item></Col>
                                <Col span={12}><Form.Item label="Lng (Ref)" name="lng"><Input disabled /></Form.Item></Col>
                            </Row>
                        </Card>
                    </Col>
                </Row>
            </Col>
            
          </Row>

          <Divider />

         
        </Form>
      </Spin>
    </div>
  );
}