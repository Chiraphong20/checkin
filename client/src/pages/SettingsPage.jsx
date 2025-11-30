import React, { useEffect, useState } from "react";
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
  Tag
} from "antd";
import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  DollarOutlined,
  SafetyOutlined,
  SaveOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import dayjs from "dayjs";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const { Title, Text } = Typography;

export default function SettingsPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 🕒 โหลดค่าจาก Firestore
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const docRef = doc(db, "settings", "checkin");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        form.setFieldsValue({
          startTime: data.startTime ? dayjs(data.startTime, "HH:mm") : dayjs("08:00", "HH:mm"),
          lateAfter: data.lateAfter ? dayjs(data.lateAfter, "HH:mm") : dayjs("08:05", "HH:mm"),
          // 🔽 --- เพิ่ม 2 ฟิลด์นี้ --- 🔽
          lateThreshold1: data.lateThreshold1 ? dayjs(data.lateThreshold1, "HH:mm") : dayjs("08:15", "HH:mm"),
          lateThreshold2: data.lateThreshold2 ? dayjs(data.lateThreshold2, "HH:mm") : dayjs("08:30", "HH:mm"),
          // 🔼 --- สิ้นสุดการเพิ่ม --- 🔼
          checkoutTime: data.checkoutTime ? dayjs(data.checkoutTime, "HH:mm") : dayjs("16:00", "HH:mm"),
          endTime: data.endTime ? dayjs(data.endTime, "HH:mm") : dayjs("17:00", "HH:mm"),
          lat: data.lat || "",
          lng: data.lng || "",
          radius: data.radius || 100,
          allowOutside: data.allowOutside || false,
          lateFine20: data.lateFine20 || 20,
          lateFine50: data.lateFine50 || 50,
          absentFine: data.absentFine || 50,
        });
      } else {
        // ตั้งค่าเริ่มต้น
        form.setFieldsValue({
          startTime: dayjs("08:00", "HH:mm"),
          lateAfter: dayjs("08:05", "HH:mm"),
          // 🔽 --- เพิ่ม 2 ฟิลด์นี้ --- 🔽
          lateThreshold1: dayjs("08:15", "HH:mm"),
          lateThreshold2: dayjs("08:30", "HH:mm"),
          // 🔼 --- สิ้นสุดการเพิ่ม --- 🔼
          checkoutTime: dayjs("16:00", "HH:mm"),
          endTime: dayjs("17:00", "HH:mm"),
          radius: 100,
          allowOutside: false,
          lateFine20: 20,
          lateFine50: 50,
          absentFine: 50,
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      message.error("โหลดการตั้งค่าล้มเหลว");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // 💾 ฟังก์ชันบันทึกการตั้งค่า
  const handleSave = async (values) => {
    try {
      setSaving(true);
      const payload = {
        startTime: values.startTime ? values.startTime.format("HH:mm") : "08:00",
        lateAfter: values.lateAfter ? values.lateAfter.format("HH:mm") : "08:05",
        // 🔽 --- เพิ่ม 2 ฟิลด์นี้ --- 🔽
        lateThreshold1: values.lateThreshold1 ? values.lateThreshold1.format("HH:mm") : "08:15",
        lateThreshold2: values.lateThreshold2 ? values.lateThreshold2.format("HH:mm") : "08:30",
        // 🔼 --- สิ้นสุดการเพิ่ม --- 🔼
        checkoutTime: values.checkoutTime ? values.checkoutTime.format("HH:mm") : "16:00",
        endTime: values.endTime ? values.endTime.format("HH:mm") : "17:00",
        lat: parseFloat(values.lat) || 0,
        lng: parseFloat(values.lng) || 0,
        radius: values.radius || 100,
        allowOutside: values.allowOutside || false,
        lateFine20: values.lateFine20 || 20,
        lateFine50: values.lateFine50 || 50,
        absentFine: values.absentFine || 50,
      };

      await setDoc(doc(db, "settings", "checkin"), payload);
      message.success("บันทึกการตั้งค่าเรียบร้อยแล้ว 🎉");
    } catch (error) {
      console.error("Error saving settings:", error);
      message.error("เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    fetchSettings();
    message.info("รีเซ็ตการตั้งค่าเป็นค่าเริ่มต้น");
  };

  return (
    <div style={{ padding: '0px', background: '#f5f5f5', minHeight: '100%' }}>
      <Card
        bordered={false}
        style={{
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}
      >
        <div style={{ marginBottom: '24px' }}>
          <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SafetyOutlined style={{ fontSize: '32px', color: '#1890ff' }} />
            การตั้งค่าระบบ
          </Title>
          <Text type="secondary" style={{ fontSize: '16px' }}>
            จัดการการตั้งค่าต่างๆ ของระบบเช็คอินพนักงาน
          </Text>
        </div>

        <Alert
          message="คำแนะนำ"
          description="การเปลี่ยนแปลงการตั้งค่าจะมีผลทันทีหลังจากบันทึก กรุณาตรวจสอบข้อมูลก่อนบันทึก"
          type="info"
          showIcon
          style={{ marginBottom: '24px' }}
        />
      </Card>

      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          style={{ background: '#f5f5f5' }}
        >
          <Row gutter={[24, 24]}>
            {/* ตั้งค่าเวลา */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <ClockCircleOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                    <span style={{ fontSize: '18px', fontWeight: '600' }}>ตั้งค่าเวลา</span>
                  </Space>
                }
                bordered={false}
                style={{
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  height: '100%'
                }}
              >
                <Form.Item
                  label={<Text strong>เวลาเริ่มงาน</Text>}
                  name="startTime"
                  tooltip="เวลาที่พนักงานต้องมาถึง (เช่น 08:00)"
                >
                  <TimePicker format="HH:mm" style={{ width: "100%" }} size="large" />
                </Form.Item>

                <Form.Item
                  label={<Text strong>กำหนดว่าสายหลังเวลา</Text>}
                  name="lateAfter"
                  tooltip="หลังจากเวลานี้จะถือว่ามาสาย (เช่น 08:05)"
                >
                  <TimePicker format="HH:mm" style={{ width: "100%" }} size="large" />
                </Form.Item>
                
                {/* 🔽 --- เพิ่ม 2 ฟิลด์นี้ --- 🔽 */}
                <Form.Item
                  label={<Text strong>เกณฑ์สาย (ระดับ 1)</Text>}
                  name="lateThreshold1"
                  tooltip="เวลาสิ้นสุดการสายระดับ 1 (เช่น 08:15)"
                >
                  <TimePicker format="HH:mm" style={{ width: "100%" }} size="large" />
                </Form.Item>

                <Form.Item
                  label={<Text strong>เกณฑ์สาย (ระดับ 2 / ขาด)</Text>}
                  name="lateThreshold2"
                  tooltip="เวลาที่ถือว่าสายมาก/ขาด (เช่น 08:30)"
                >
                  <TimePicker format="HH:mm" style={{ width: "100%" }} size="large" />
                </Form.Item>
                {/* 🔼 --- สิ้นสุดการเพิ่ม --- 🔼 */}

                <Form.Item
                  label={<Text strong>เวลาเช็คเอาท์ (อย่างน้อย)</Text>}
                  name="checkoutTime"
                  tooltip="เวลาที่สามารถเช็คเอาท์ได้ (เช่น 16:00)"
                >
                  <TimePicker format="HH:mm" style={{ width: "100%" }} size="large" />
                </Form.Item>

                <Form.Item
                  label={<Text strong>เวลาเลิกงาน</Text>}
                  name="endTime"
                  tooltip="เวลาปกติที่เลิกงาน (เช่น 17:00)"
                >
                  <TimePicker format="HH:mm" style={{ width: "100%" }} size="large" />
                </Form.Item>
              </Card>
            </Col>

            {/* ตั้งค่าค่าปรับ */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <DollarOutlined style={{ fontSize: '20px', color: '#52c41a' }} />
                    <span style={{ fontSize: '18px', fontWeight: '600' }}>ตั้งค่าค่าปรับ</span>
                  </Space>
                }
                bordered={false}
                style={{
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  height: '100%'
                }}
              >
                <Alert
                  message="กฎการหักค่าปรับ (อ้างอิงจากเวลาที่ตั้ง)"
                  description={
                    <div>
                      <Text>• <Text strong>ค่าปรับมาสาย (20 บาท):</Text> ใช้สำหรับสายหลัง <Tag color="blue">{"'กำหนดว่าสาย'"}</Tag> จนถึง <Tag color="blue">{"'เกณฑ์สาย (ระดับ 1)'"}</Tag></Text><br />
                      <Text>• <Text strong>ค่าปรับมาสาย (50 บาท):</Text> ใช้สำหรับสายหลัง <Tag color="blue">{"'เกณฑ์สาย (ระดับ 1)'"}</Tag> จนถึง <Tag color="blue">{"'เกณฑ์สาย (ระดับ 2)'"}</Tag></Text><br />
                      <Text>• <Text strong>ค่าปรับหยุดงาน:</Text> ใช้สำหรับสายหลัง <Tag color="blue">{"'เกณฑ์สาย (ระดับ 2)'"}</Tag></Text>
                    </div>
                  }
                  type="info"
                  showIcon
                  style={{ marginBottom: '16px' }}
                />

                <Form.Item
                  label={<Text strong>ค่าปรับมาสาย (ระดับ 1)</Text>}
                  name="lateFine20"
                  tooltip="ค่าปรับสำหรับมาสายในช่วงแรก"
                >
                  <InputNumber
                    min={0}
                    max={1000}
                    style={{ width: "100%" }}
                    size="large"
                    addonAfter="บาท"
                  />
                </Form.Item>

                <Form.Item
                  label={<Text strong>ค่าปรับมาสาย (ระดับ 2)</Text>}
                  name="lateFine50"
                  tooltip="ค่าปรับสำหรับมาสายในช่วงที่สอง"
                >
                  <InputNumber
                    min={0}
                    max={1000}
                    style={{ width: "100%" }}
                    size="large"
                    addonAfter="บาท"
                  />
                </Form.Item>

                <Form.Item
                  label={<Text strong>ค่าปรับหยุดงาน</Text>}
                  name="absentFine"
                  tooltip="ค่าปรับสำหรับพนักงานที่หยุดงานหรือมาสายมาก"
                >
                  <InputNumber
                    min={0}
                    max={1000}
                    style={{ width: "100%" }}
                    size="large"
                    addonAfter="บาท"
                  />
                </Form.Item>
              </Card>
            </Col>

            {/* ตั้งค่าพิกัด */}
            <Col xs={24}>
              <Card
                title={
                  <Space>
                    <EnvironmentOutlined style={{ fontSize: '20px', color: '#ff4d4f' }} />
                    <span style={{ fontSize: '18px', fontWeight: '600' }}>ตั้งค่าพิกัดและพื้นที่เช็คอิน</span>
                  </Space>
                }
                bordered={false}
                style={{
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              >
                <Alert
                  message="หมายเหตุ: ระบบนี้ใช้พิกัดแยกตามสาขา"
                  description="การตั้งค่า Lat/Lng ในหน้านี้ *ไม่มีผล* กับการเช็คอิน (เนื่องจากระบบเช็คอินอ้างอิงพิกัดจากรายชื่อสาขา) แต่การตั้งค่า 'รัศมี' และ 'อนุญาตินอกพื้นที่' จะมีผลกับทุกสาขา"
                  type="warning"
                  showIcon
                  style={{ marginBottom: '24px' }}
                />

                <Row gutter={[16, 0]}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label={<Text strong>Latitude (สำหรับอ้างอิง)</Text>}
                      name="lat"
                    >
                      <Input
                        placeholder="เช่น 14.9910"
                        size="large"
                        prefix="📍"
                        disabled
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label={<Text strong>Longitude (สำหรับอ้างอิง)</Text>}
                      name="lng"
                    >
                      <Input
                        placeholder="เช่น 102.1150"
                        size="large"
                      	prefix="📍"
                      	disabled
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={[16, 0]}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label={<Text strong>รัศมีอนุญาต (เมตร)</Text>}
                      name="radius"
                      tooltip="ระยะห่างที่อนุญาตให้เช็คอินได้จากพิกัดของ 'สาขา'"
                    >
                      <InputNumber
                        min={50}
                        max={1000}
                        style={{ width: "100%" }}
                        size="large"
                        addonAfter="เมตร"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label={<Text strong>อนุญาตให้นอกพื้นที่เช็คอิน</Text>}
                      name="allowOutside"
                      valuePropName="checked"
                      tooltip="เปิด: เช็คอินได้แต่จะถูกบันทึกว่า 'นอกพื้นที่' | ปิด: บล็อกการเช็คอินถ้านอกพื้นที่"
                    >
                      <Switch
                        checkedChildren="อนุญาต"
                      	unCheckedChildren="ไม่อนุญาต"
                      	size="default"
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          <Divider />

          <Card
            bordered={false}
            style={{
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            }}
            bodyStyle={{ padding: '24px' }}
          >
            <Row justify="space-between" align="middle">
              <Col>
                <Text strong style={{ color: 'white', fontSize: '16px' }}>
                  พร้อมบันทึกการตั้งค่าแล้ว
                </Text>
              </Col>
              <Col>
                <Space>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                    size="large"
                    style={{ background: 'rgba(255,255,255,0.2)', borderColor: 'white', color: 'white' }}
a                 >
                    รีเซ็ต
                  </Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={saving}
                    icon={<SaveOutlined />}
                    size="large"
                    style={{
                      background: 'white',
                      borderColor: 'white',
                      color: '#667eea',
                      fontWeight: 'bold'
                    }}
                  >
                    บันทึกการตั้งค่า
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>
        </Form>
      </Spin>
    </div>
  );
}