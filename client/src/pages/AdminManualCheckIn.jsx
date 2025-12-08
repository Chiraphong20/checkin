import React, { useState, useEffect } from "react";
import {
  Card,
  DatePicker,
  Table,
  Tag,
  Button,
  Modal,
  Form,
  TimePicker,
  Select,
  Input,
  message,
  Typography,
  Space,
  Row,
  Col,
  Alert
} from "antd";
import {
  CalendarOutlined,
  EditOutlined,
  SaveOutlined,
  ReloadOutlined,
  CalculatorOutlined,
  SearchOutlined // ✅ 1. เพิ่ม Icon ค้นหา
} from "@ant-design/icons";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import { db } from "../firebase";
import { collection, getDocs, query, where, doc, updateDoc, addDoc, getDoc } from "firebase/firestore";

dayjs.extend(isBetween);

const { Title, Text } = Typography;
const { Option } = Select;

const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

export default function AdminDailyManage() {
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  
  const [tableData, setTableData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [settings, setSettings] = useState(null);

  // ✅ 2. เพิ่ม State สำหรับคำค้นหา
  const [searchText, setSearchText] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [form] = Form.useForm();

  // 1. โหลดข้อมูล Master
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [empSnap, branchSnap, settingSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "branches")),
          getDoc(doc(db, "settings", "checkin"))
        ]);
        
        setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setBranches(branchSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        if (settingSnap.exists()) {
          const s = settingSnap.data();
          setSettings({
            ...s,
            lateAfterMinutes: timeToMinutes(s.lateAfter || "08:15"),
            lateThreshold1Minutes: timeToMinutes(s.lateThreshold1 || "08:30"),
            lateThreshold2Minutes: timeToMinutes(s.lateThreshold2 || "09:00"),
          });
        }
      } catch (error) {
        message.error("โหลดข้อมูลตั้งต้นไม่สำเร็จ");
      }
    };
    fetchMasterData();
  }, []);

  // 2. โหลดข้อมูลเมื่อเปลี่ยนวันที่
  useEffect(() => {
    if (employees.length > 0) {
      fetchDailyData(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, employees]);

  const fetchDailyData = async (dateObj) => {
    setLoading(true);
    try {
      const dateStr = dateObj.format("YYYY-MM-DD");
      
      const qCheckin = query(collection(db, "employee_checkin"), where("date", "==", dateStr));
      const qLeave = query(collection(db, "employee_leave")); 

      const [checkinSnap, leaveSnap] = await Promise.all([
        getDocs(qCheckin),
        getDocs(qLeave)
      ]);

      const attendanceMap = {};
      checkinSnap.forEach(doc => {
        attendanceMap[doc.data().employeeId] = { ...doc.data(), docId: doc.id, type: 'checkin' };
      });

      const leaveMap = {};
      leaveSnap.forEach(doc => {
        const data = doc.data();
        const startDate = dayjs(data.start || data.date);
        const endDate = dayjs(data.end || data.date);
        
        if (dateObj.isBetween(startDate, endDate, 'day', '[]')) {
            leaveMap[data.employeeId] = { 
                ...data, 
                docId: doc.id, 
                type: 'leave',
                status: data.status === 'Approved' ? `ลา${data.type || ''} (อนุมัติ)` 
                      : data.status === 'Pending' ? `ลา${data.type || ''} (รออนุมัติ)` 
                      : `ลา${data.type || ''}`
            };
        }
      });

      const mergedList = employees.map(emp => {
        const checkinRecord = attendanceMap[emp.employeeId];
        const leaveRecord = leaveMap[emp.employeeId];

        let finalRecord = null;
        let displayStatus = "ยังไม่ลงเวลา";
        let displayCheckinTime = "-";
        let displayCheckoutTime = "-";
        let displayBranch = emp.branch || "-";
        let displayFine = 0;
        let displayNote = "";

        if (checkinRecord) {
            finalRecord = checkinRecord;
            displayStatus = checkinRecord.status;
            displayCheckinTime = checkinRecord.checkinTime;
            displayCheckoutTime = checkinRecord.checkoutTime;
            displayBranch = checkinRecord.branch;
            displayFine = checkinRecord.fine;
            displayNote = checkinRecord.manualNote || checkinRecord.note;
        } else if (leaveRecord) {
            finalRecord = leaveRecord;
            displayStatus = leaveRecord.status;
            displayNote = leaveRecord.reason || "บันทึกการลา";
        }

        return {
          key: emp.employeeId,
          employeeId: emp.employeeId,
          name: emp.name,
          department: emp.department || "-",
          defaultBranch: emp.branch || (emp.branches ? emp.branches[0] : "-"),
          
          hasRecord: !!checkinRecord,
          isLeave: !!leaveRecord && !checkinRecord,
          
          docId: finalRecord ? finalRecord.docId : null,
          checkinTime: displayCheckinTime,
          checkoutTime: displayCheckoutTime,
          status: displayStatus,
          branch: displayBranch,
          fine: displayFine,
          note: displayNote
        };
      });

      setTableData(mergedList);
    } catch (error) {
      console.error(error);
      message.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const calculateAutoStatus = (timeObj) => {
    if (!settings || !timeObj) return { status: "ปกติ", fine: 0 };
    const timeStr = timeObj.format("HH:mm");
    const minutes = timeToMinutes(timeStr);
    const { lateAfterMinutes, lateThreshold1Minutes, lateThreshold2Minutes, lateFine20, lateFine50, absentFine } = settings;

    let status = "ปกติ";
    let fine = 0;

    if (minutes <= lateAfterMinutes) { status = "ปกติ"; fine = 0; }
    else if (minutes <= lateThreshold1Minutes) { status = "มาสาย (ระดับ 1)"; fine = lateFine20 || 0; }
    else if (minutes <= lateThreshold2Minutes) { status = "มาสาย (ระดับ 2)"; fine = lateFine50 || 0; }
    else { status = "ขาดงาน/สายมาก"; fine = absentFine || 0; }

    return { status, fine };
  };

  const handleTimeChange = (time) => {
    if (time) {
      const { status, fine } = calculateAutoStatus(time);
      form.setFieldsValue({ status, fine });
      message.success(`คำนวณอัตโนมัติ: ${status}`);
    }
  };

  const handleEditClick = (record) => {
    setCurrentRecord(record);
    setIsModalOpen(true);
    
    form.setFieldsValue({
      checkinTime: record.checkinTime !== "-" ? dayjs(record.checkinTime, "HH:mm") : null,
      checkoutTime: record.checkoutTime !== "-" && record.checkoutTime !== null ? dayjs(record.checkoutTime, "HH:mm") : null,
      branch: record.branch !== "-" ? record.branch : record.defaultBranch,
      status: record.status === "ยังไม่ลงเวลา" ? "ปกติ" : record.status, 
      fine: record.fine || 0,
      note: record.note
    });
  };

  const handleSave = async (values) => {
    try {
      setLoading(true);
      const dateStr = selectedDate.format("YYYY-MM-DD");
      const checkinTimeStr = values.checkinTime ? values.checkinTime.format("HH:mm") : "-";
      const checkoutTimeStr = values.checkoutTime ? values.checkoutTime.format("HH:mm") : "-";
      
      const saveData = {
        checkinTime: checkinTimeStr,
        checkoutTime: checkoutTimeStr,
        branch: values.branch,
        status: values.status,
        fine: Number(values.fine) || 0,
        manualNote: values.note || "",
        isManual: true,
        manualBy: "Admin",
        timestamp: values.checkinTime 
          ? dayjs(`${dateStr} ${checkinTimeStr}`).format("YYYY-MM-DD HH:mm:ss")
          : dayjs().format("YYYY-MM-DD HH:mm:ss")
      };

      if (currentRecord.hasRecord && currentRecord.docId) {
        await updateDoc(doc(db, "employee_checkin", currentRecord.docId), saveData);
        message.success("อัปเดตข้อมูลเรียบร้อย");
      } else {
        await addDoc(collection(db, "employee_checkin"), {
          ...saveData,
          date: dateStr,
          employeeId: currentRecord.employeeId,
          name: currentRecord.name,
          department: currentRecord.department,
          lineUserId: "", 
          phone: ""
        });
        message.success("สร้างรายการใหม่เรียบร้อย");
      }

      setIsModalOpen(false);
      fetchDailyData(selectedDate);

    } catch (error) {
      console.error(error);
      message.error("บันทึกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // ✅ 3. Logic Filter ข้อมูลตามคำค้นหา
  const filteredData = tableData.filter((item) => {
    const query = searchText.toLowerCase();
    return (
        item.name?.toLowerCase().includes(query) || // ค้นหาชื่อ
        item.employeeId?.toLowerCase().includes(query) || // ค้นหารหัสพนักงาน
        item.department?.toLowerCase().includes(query) // (เสริม) ค้นหาแผนก
    );
  });

  const columns = [
    {
      title: "พนักงาน",
      dataIndex: "name",
      key: "name",
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{text}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>{record.employeeId}</div>
        </div>
      )
    },
    {
      title: "เวลาเข้า",
      dataIndex: "checkinTime",
      key: "checkinTime",
      render: (text) => text === "-" ? <Text type="secondary">-</Text> : <Tag color="blue">{text}</Tag>
    },
    {
      title: "เวลาออก",
      dataIndex: "checkoutTime",
      key: "checkoutTime",
      render: (text) => text === "-" ? <Text type="secondary">-</Text> : <Tag color="purple">{text}</Tag>
    },
    {
      title: "สถานะ",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        let color = "default";
        if (status === "ยังไม่ลงเวลา") color = "default";
        else if (status.includes("ปกติ")) color = "success";
        else if (status.includes("สาย")) color = "warning";
        else if (status.includes("ขาด")) color = "error";
        else if (status.includes("ลา") || status.includes("พักร้อน")) color = "processing";
        
        return <Tag color={color}>{status}</Tag>;
      }
    },
    {
      title: "ค่าปรับ",
      dataIndex: "fine",
      key: "fine",
      render: (val) => val > 0 ? <Text type="danger">{val}</Text> : "-"
    },
    {
      title: "จัดการ",
      key: "action",
      render: (_, record) => (
        <Button 
          type="primary" 
          ghost 
          size="small" 
          icon={<EditOutlined />} 
          onClick={() => handleEditClick(record)}
        >
          {(record.hasRecord || record.isLeave) ? "แก้ไข" : "ลงเวลา"}
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: 0 }}>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              <CalendarOutlined /> จัดการเวลาลงงานรายวัน
            </Title>
            <Text type="secondary">ตรวจสอบ เช็คอิน / ขาด / ลา ในแต่ละวัน</Text>
          </Col>
          <Col>
            <Space>
              {/* ✅ 4. เพิ่มช่อง Input Search */}
              <Input 
                 placeholder="ค้นหาชื่อ / รหัส" 
                 prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                 value={searchText}
                 onChange={(e) => setSearchText(e.target.value)}
                 style={{ width: 200 }}
                 allowClear
              />

              <Button icon={<ReloadOutlined />} onClick={() => fetchDailyData(selectedDate)} />
              <span style={{ fontSize: 16 }}>วันที่: </span>
              <DatePicker 
                value={selectedDate} 
                onChange={(date) => date && setSelectedDate(date)}
                format="DD/MM/YYYY"
                allowClear={false}
                size="large"
                style={{ width: 160 }}
              />
            </Space>
          </Col>
        </Row>

        {/* ✅ 5. เปลี่ยน dataSource เป็น filteredData */}
        <Table 
          columns={columns} 
          dataSource={filteredData} 
          loading={loading}
          pagination={{ pageSize: 10 }}
          bordered
          rowClassName={(record) => (!record.hasRecord && !record.isLeave) ? "bg-gray-50" : ""}
        />
      </Card>

      {/* Modal แก้ไข (คงเดิม) */}
      <Modal
        title={
          <span>
            <EditOutlined /> แก้ไขข้อมูล: <strong>{currentRecord?.name}</strong> 
            <span style={{ fontSize: 12, marginLeft: 10, color: '#888' }}>
               ({selectedDate.format("DD/MM/YYYY")})
            </span>
          </span>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Alert
          message="Auto Calculation"
          description="เปลี่ยนเวลาเข้างาน = คำนวณสถานะ/ค่าปรับใหม่อัตโนมัติ"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Row gutter={16}>
             <Col span={12}>
                <Form.Item name="checkinTime" label="เวลาเข้างาน">
                    <TimePicker format="HH:mm" style={{ width: '100%' }} onChange={handleTimeChange} />
                </Form.Item>
             </Col>
             <Col span={12}>
                <Form.Item name="checkoutTime" label="เวลาออกงาน">
                    <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
             </Col>
          </Row>

          <Row gutter={16}>
             <Col span={12}>
                <Form.Item name="status" label="สถานะ" rules={[{ required: true }]}>
                    <Select>
                        <Option value="ปกติ">ปกติ</Option>
                        <Option value="มาสาย (ระดับ 1)">มาสาย (ระดับ 1)</Option>
                        <Option value="มาสาย (ระดับ 2)">มาสาย (ระดับ 2)</Option>
                        <Option value="ขาดงาน/สายมาก">ขาดงาน/สายมาก</Option>
                        <Option value="ลากิจ">ลากิจ</Option>
                        <Option value="ลาป่วย">ลาป่วย</Option>
                        <Option value="พักร้อน">พักร้อน</Option>
                    </Select>
                </Form.Item>
             </Col>
             <Col span={12}>
                <Form.Item name="fine" label="ค่าปรับ (บาท)">
                    <Input type="number" prefix={<CalculatorOutlined />} />
                </Form.Item>
             </Col>
          </Row>

          <Form.Item name="branch" label="สาขา">
             <Select>
                {branches.map(b => <Option key={b.id} value={b.name}>{b.name}</Option>)}
             </Select>
          </Form.Item>

          <Form.Item name="note" label="หมายเหตุ">
             <Input.TextArea rows={2} />
          </Form.Item>
          
          <div style={{ textAlign: 'right', marginTop: 10 }}>
             <Button onClick={() => setIsModalOpen(false)} style={{ marginRight: 8 }}>ยกเลิก</Button>
             <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
               บันทึก
             </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}