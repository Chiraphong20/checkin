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
  Alert,
  Radio 
} from "antd";
import {
  CalendarOutlined,
  EditOutlined,
  SaveOutlined,
  ReloadOutlined,
  CalculatorOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import { db } from "../firebase";
import { collection, getDocs, query, where, doc, updateDoc, addDoc, getDoc } from "firebase/firestore";

dayjs.extend(isBetween);

const { Title, Text } = Typography;
const { Option } = Select;

// Helper แปลงเวลา
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
  const [settings, setSettings] = useState(null); // Global Settings (ค่าปรับ)

  const [searchText, setSearchText] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [form] = Form.useForm();

  // 1. โหลดข้อมูล Master (พนักงาน, สาขา, ตั้งค่ากลาง)
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
            // ค่าปรับ Global
            lateFine20: s.lateFine20 || 20,
            lateFine50: s.lateFine50 || 50,
            absentFine: s.absentFine || 50,
            // Fallback เวลา (เผื่อสาขาไม่มีตั้งค่า)
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

  // 2. โหลดข้อมูลรายวัน
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
        const data = doc.data();
        attendanceMap[data.employeeId] = { ...data, docId: doc.id, type: 'checkin', shift: data.shift || 1 };
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
        let displayBranch = emp.branch || (emp.branches ? emp.branches[0] : "-");
        let displayFine = 0;
        let displayNote = "";
        let displayShift = 1;

        if (checkinRecord) {
            finalRecord = checkinRecord;
            displayStatus = checkinRecord.status;
            displayCheckinTime = checkinRecord.checkinTime;
            displayCheckoutTime = checkinRecord.checkoutTime;
            displayBranch = checkinRecord.branch;
            displayFine = checkinRecord.fine;
            displayNote = checkinRecord.manualNote || checkinRecord.note;
            displayShift = checkinRecord.shift; 
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
          note: displayNote,
          shift: displayShift 
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

  // ✅ 3. Logic คำนวณสถานะ (รองรับ 2 กะ และเวลาตามสาขา)
  const calculateAutoStatus = (timeObj, branchName, shift) => {
    // ✅ แก้ไขค่าเริ่มต้นเป็น "มาปกติ"
    if (!settings || !timeObj) return { status: "มาปกติ", fine: 0 };
    
    // 1. หา Config ของสาขาที่เลือก
    const branchConfig = branches.find(b => b.name === branchName);
    
    let lateAfter, t1, t2;

    if (branchConfig) {
        // ใช้เวลาจากสาขาตามกะที่เลือก
        if (shift === 2 && branchConfig.hasShift2) {
            lateAfter = timeToMinutes(branchConfig.shift2_lateAfter || "13:05");
            t1 = timeToMinutes(branchConfig.shift2_lateThreshold1 || "13:15");
            t2 = timeToMinutes(branchConfig.shift2_lateThreshold2 || "13:30");
        } else {
            // Shift 1
            lateAfter = timeToMinutes(branchConfig.shift1_lateAfter || branchConfig.lateAfter || "08:05");
            t1 = timeToMinutes(branchConfig.shift1_lateThreshold1 || branchConfig.lateThreshold1 || "08:15");
            t2 = timeToMinutes(branchConfig.shift1_lateThreshold2 || branchConfig.lateThreshold2 || "08:30");
        }
    } else {
        // Fallback ใช้ Global Settings ถ้าไม่เจอสาขา
        lateAfter = settings.lateAfterMinutes;
        t1 = settings.lateThreshold1Minutes;
        t2 = settings.lateThreshold2Minutes;
    }

    const timeStr = timeObj.format("HH:mm");
    const minutes = timeToMinutes(timeStr);
    const { lateFine20, lateFine50, absentFine } = settings;

    // ✅ แก้ไข string เป็น "มาปกติ"
    let status = "มาปกติ";
    let fine = 0;

    if (minutes <= lateAfter) { status = "มาปกติ"; fine = 0; }
    else if (minutes <= t1) { status = "มาสาย (ระดับ 1)"; fine = lateFine20 || 0; }
    else if (minutes <= t2) { status = "มาสาย (ระดับ 2)"; fine = lateFine50 || 0; }
    else { status = "ขาดงาน/สายมาก"; fine = absentFine || 0; }

    return { status, fine };
  };

  // Trigger คำนวณเมื่อเปลี่ยน เวลา, สาขา หรือ กะ
  const triggerAutoCalc = () => {
      const values = form.getFieldsValue();
      if (values.checkinTime) {
          const { status, fine } = calculateAutoStatus(values.checkinTime, values.branch, values.shift);
          form.setFieldsValue({ status, fine });
          message.success(`คำนวณอัตโนมัติ (กะ ${values.shift}): ${status}`);
      }
  };

  const handleEditClick = (record) => {
    setCurrentRecord(record);
    setIsModalOpen(true);
    
    form.setFieldsValue({
      checkinTime: record.checkinTime !== "-" ? dayjs(record.checkinTime, "HH:mm") : null,
      checkoutTime: record.checkoutTime !== "-" && record.checkoutTime !== null ? dayjs(record.checkoutTime, "HH:mm") : null,
      branch: record.branch !== "-" ? record.branch : record.defaultBranch,
      // ✅ แก้ไข Default status เป็น "มาปกติ"
      status: record.status === "ยังไม่ลงเวลา" ? "มาปกติ" : record.status, 
      fine: record.fine || 0,
      note: record.note,
      shift: record.shift || 1 
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
        shift: values.shift || 1, 
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

  // Filter
  const filteredData = tableData.filter((item) => {
    const query = searchText.toLowerCase();
    return (
        item.name?.toLowerCase().includes(query) || 
        item.employeeId?.toLowerCase().includes(query) || 
        item.department?.toLowerCase().includes(query)
    );
  });

  const columns = [
    {
      title: "พนักงาน",
      dataIndex: "name",
      key: "name",
      width: 180,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{text}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>{record.employeeId}</div>
        </div>
      )
    },
    {
        title: "กะ", 
        dataIndex: "shift",
        key: "shift",
        width: 80,
        align: 'center',
        render: (s) => <Tag color="geekblue">กะ {s || 1}</Tag>
    },
    {
      title: "เวลาเข้า",
      dataIndex: "checkinTime",
      key: "checkinTime",
      align: 'center',
      render: (text) => text === "-" ? <Text type="secondary">-</Text> : <Tag color="blue">{text}</Tag>
    },
    {
      title: "เวลาออก",
      dataIndex: "checkoutTime",
      key: "checkoutTime",
      align: 'center',
      render: (text) => text === "-" ? <Text type="secondary">-</Text> : <Tag color="purple">{text}</Tag>
    },
    {
      title: "สถานะ",
      dataIndex: "status",
      key: "status",
      align: 'center',
      render: (status) => {
        let color = "default";
        if (status === "ยังไม่ลงเวลา") color = "default";
        // หมายเหตุ: ใช้ .includes("ปกติ") จะครอบคลุมทั้ง "ปกติ" และ "มาปกติ"
        else if (status.includes("ปกติ")) color = "success";
        else if (status.includes("สาย")) color = "warning";
        else if (status.includes("ขาด") || status.includes("พื้นที่")) color = "error";
        else if (status.includes("ลา") || status.includes("พักร้อน")) color = "processing";
        
        return <Tag color={color}>{status}</Tag>;
      }
    },
    {
      title: "ค่าปรับ",
      dataIndex: "fine",
      key: "fine",
      align: 'right',
      render: (val) => val > 0 ? <Text type="danger">{val}</Text> : "-"
    },
    {
      title: "จัดการ",
      key: "action",
      align: 'center',
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

        <Table 
          columns={columns} 
          dataSource={filteredData} 
          loading={loading}
          pagination={{ pageSize: 10 }}
          bordered
          rowClassName={(record) => (!record.hasRecord && !record.isLeave) ? "bg-gray-50" : ""}
        />
      </Card>

      {/* Modal แก้ไข */}
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
          description="เปลี่ยนเวลาเข้า/กะ/สาขา = คำนวณสถานะใหม่อัตโนมัติ (อิงตามเวลาสาขา)"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Form form={form} layout="vertical" onFinish={handleSave}>
          
          <Row gutter={16}>
             <Col span={12}>
                <Form.Item name="shift" label="กะการทำงาน">
                    <Radio.Group onChange={triggerAutoCalc} buttonStyle="solid">
                        <Radio.Button value={1}>กะ 1</Radio.Button>
                        <Radio.Button value={2}>กะ 2</Radio.Button>
                    </Radio.Group>
                </Form.Item>
             </Col>
             <Col span={12}>
                <Form.Item name="branch" label="สาขา">
                    <Select onChange={triggerAutoCalc}>
                        {branches.map(b => <Option key={b.id} value={b.name}>{b.name}</Option>)}
                    </Select>
                </Form.Item>
             </Col>
          </Row>

          <Row gutter={16}>
             <Col span={12}>
                <Form.Item name="checkinTime" label="เวลาเข้างาน">
                    <TimePicker format="HH:mm" style={{ width: '100%' }} onChange={triggerAutoCalc} />
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
                        {/* ✅ เปลี่ยน Option เป็น "มาปกติ" */}
                        <Option value="มาปกติ">มาปกติ</Option>
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