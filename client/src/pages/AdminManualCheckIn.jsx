import React, { useState, useEffect, useCallback } from "react";
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
  Radio,
  Spin
} from "antd";
import {
  CalendarOutlined,
  EditOutlined,
  SaveOutlined,
  ReloadOutlined,
  CalculatorOutlined,
  SearchOutlined,
  FieldTimeOutlined
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

export default function AdminManualCheckIn() {
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  
  const [tableData, setTableData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [holidays, setHolidays] = useState([]); // ✅ เพิ่ม State วันหยุด
  const [settings, setSettings] = useState(null);
  const [branchMap, setBranchMap] = useState({}); // ✅ Map ชื่อสาขา -> ID

  const [searchText, setSearchText] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [form] = Form.useForm();

  // 1. โหลดข้อมูล Master (พนักงาน, สาขา, ตั้งค่า, วันหยุด)
  const fetchMasterData = useCallback(async () => {
      try {
        setLoading(true);
        const [empSnap, branchSnap, settingSnap, holidaySnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "branches")),
          getDoc(doc(db, "settings", "checkin")),
          getDocs(collection(db, "public_holidays"))
        ]);
        
        setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const bMap = {};
        const bList = branchSnap.docs.map(d => {
            const data = d.data();
            bMap[data.name] = d.id; // Map ชื่อ -> ID
            return { id: d.id, ...data };
        });
        setBranches(bList);
        setBranchMap(bMap);

        setHolidays(holidaySnap.docs.map(d => d.data()));

        if (settingSnap.exists()) {
          const s = settingSnap.data();
          setSettings(s);
        }
      } catch (error) {
        message.error("โหลดข้อมูลตั้งต้นไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  // 2. โหลดข้อมูลรายวัน
  useEffect(() => {
    if (employees.length > 0) {
      fetchDailyData(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, employees, holidays]); // ✅ เพิ่ม holidays ใน dependency

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
            // ถ้าอนุมัติแล้ว หรือ รออนุมัติ
            if (['Approved', 'Pending'].includes(data.status)) {
                leaveMap[data.employeeId] = { 
                    ...data, 
                    docId: doc.id, 
                    type: 'leave',
                    statusLabel: data.status === 'Approved' ? `ลา${data.type || ''}` : `ลา${data.type || ''} (รอ)`
                };
            }
        }
      });

      // ✅ หาว่าวันนี้เป็นวันหยุดหรือไม่
      const todayHoliday = holidays.find(h => h.date === dateStr);
      
      // ✅ ตรวจสอบวันหยุดเสาร์-อาทิตย์
      const isWeekend = dateObj.day() === 0 || dateObj.day() === 6;

      const mergedList = employees.map(emp => {
        const checkinRecord = attendanceMap[emp.employeeId];
        const leaveRecord = leaveMap[emp.employeeId];

        let finalRecord = null;
        let displayStatus = "ยังไม่ลงเวลา"; // Default
        let displayCheckinTime = "-";
        let displayCheckoutTime = "-";
        let displayBranch = emp.branch || (emp.branches ? emp.branches[0] : "-");
        let displayFine = 0;
        let displayNote = "";
        let displayShift = 1;

        // --- Logic การกำหนดสถานะ ---
        
        if (checkinRecord) {
            // 1. มีการลงเวลา (Check-in) -> ยึดตามนั้น
            finalRecord = checkinRecord;
            displayStatus = checkinRecord.status;
            displayCheckinTime = checkinRecord.checkinTime;
            displayCheckoutTime = checkinRecord.checkoutTime;
            displayBranch = checkinRecord.branch;
            displayFine = checkinRecord.fine;
            displayNote = checkinRecord.manualNote || checkinRecord.note;
            displayShift = checkinRecord.shift;
        } else if (leaveRecord) {
            // 2. มีใบลา -> ยึดตามใบลา
            finalRecord = leaveRecord;
            displayStatus = leaveRecord.statusLabel;
            displayNote = leaveRecord.reason || "บันทึกการลา";
        } else {
            // 3. ไม่มีข้อมูล -> เช็คว่าเป็นวันหยุดหรือไม่?
            
            // 3.1 เช็คผู้บริหาร (01)
            if (emp.department === "01") {
                displayStatus = "ผู้บริหาร";
                displayFine = 0;
            } 
            // 3.2 เช็ค Office (02) -> หยุดเสาร์-อาทิตย์ และ นักขัตฤกษ์
            else if (emp.department === "02") {
                 let isOfficeHoliday = isWeekend;
                 
                 // เช็ควันหยุดนักขัตฤกษ์สำหรับ Office
                 if (todayHoliday) {
                     // ต้องดูว่า Office นี้อยู่สาขาไหน แล้วสาขานั้นหยุดไหม
                     // (ปกติ Office หยุดตามปฏิทินกลาง หรือ check targetBranches)
                     const empBranchId = branchMap[emp.branch];
                     if (!todayHoliday.targetBranches || todayHoliday.targetBranches === "ALL" || todayHoliday.targetBranches.length === 0) {
                         isOfficeHoliday = true;
                     } else if (empBranchId && Array.isArray(todayHoliday.targetBranches) && todayHoliday.targetBranches.includes(empBranchId)) {
                         isOfficeHoliday = true;
                     }
                 }

                 if (isOfficeHoliday) {
                     displayStatus = "วันหยุด";
                     displayFine = 0;
                 }
            } 
            // 3.3 เช็ค Sales/Transport (03, 04) -> หยุดตามประกาศสาขา
            else if (todayHoliday) {
                 const empBranchId = branchMap[emp.branch];
                 let isBranchStopped = false;

                 // เช็คว่าสาขาหยุดไหม
                 if (!todayHoliday.targetBranches || todayHoliday.targetBranches === "ALL" || todayHoliday.targetBranches.length === 0) {
                     isBranchStopped = true;
                 } else if (empBranchId && Array.isArray(todayHoliday.targetBranches) && todayHoliday.targetBranches.includes(empBranchId)) {
                     isBranchStopped = true;
                 }

                 // ถ้าสาขาหยุด แต่ Sales ห้ามหยุด -> ต้องมาทำงาน (ยังไม่ลงเวลา)
                 if (isBranchStopped && ["03", "04"].includes(emp.department) && !todayHoliday.allowSales) {
                     // ต้องมาทำงาน -> สถานะยังคงเป็น "ยังไม่ลงเวลา"
                 } else if (isBranchStopped) {
                     // สาขาหยุด และ Sales หยุดได้ -> เป็นวันหยุด
                     displayStatus = `วันหยุด (${todayHoliday.title})`;
                     displayFine = 0;
                 }
            }
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

  // 3. คำนวณ Auto Status สำหรับการแก้ไข Manual
  const calculateAutoStatus = (timeObj, branchName, shift) => {
    if (!settings || !timeObj) return { status: "ปกติ", fine: 0 };
    
    const branchConfig = branches.find(b => b.name === branchName);
    
    let lateAfter, t1, t2;

    if (branchConfig) {
        if (shift === 2 && branchConfig.hasShift2) {
            lateAfter = timeToMinutes(branchConfig.shift2_lateAfter || "13:05");
            t1 = timeToMinutes(branchConfig.shift2_lateThreshold1 || "13:15");
            t2 = timeToMinutes(branchConfig.shift2_lateThreshold2 || "13:30");
        } else {
            lateAfter = timeToMinutes(branchConfig.shift1_lateAfter || branchConfig.lateAfter || "08:05");
            t1 = timeToMinutes(branchConfig.shift1_lateThreshold1 || branchConfig.lateThreshold1 || "08:15");
            t2 = timeToMinutes(branchConfig.shift1_lateThreshold2 || branchConfig.lateThreshold2 || "08:30");
        }
    } else {
        lateAfter = settings.lateAfterMinutes || timeToMinutes("08:05");
        t1 = settings.lateThreshold1Minutes || timeToMinutes("08:15");
        t2 = settings.lateThreshold2Minutes || timeToMinutes("08:30");
    }

    const timeStr = timeObj.format("HH:mm");
    const minutes = timeToMinutes(timeStr);
    const { lateFine20, lateFine50, absentFine } = settings;

    let status = "ปกติ";
    let fine = 0;

    if (minutes <= lateAfter) { status = "มาปกติ"; fine = 0; }
    else if (minutes <= t1) { status = "มาสาย (ระดับ 1)"; fine = lateFine20 || 20; }
    else if (minutes <= t2) { status = "มาสาย (ระดับ 2)"; fine = lateFine50 || 50; }
    else { status = "ขาดงาน/สายมาก"; fine = absentFine || 50; }

    return { status, fine };
  };

  const triggerAutoCalc = () => {
      const values = form.getFieldsValue();
      if (values.checkinTime) {
          const { status, fine } = calculateAutoStatus(values.checkinTime, values.branch, values.shift);
          form.setFieldsValue({ status, fine });
      }
  };

  const handleEditClick = (record) => {
    setCurrentRecord(record);
    setIsModalOpen(true);
    
    form.setFieldsValue({
      checkinTime: record.checkinTime !== "-" ? dayjs(record.checkinTime, "HH:mm") : null,
      checkoutTime: record.checkoutTime !== "-" && record.checkoutTime !== null ? dayjs(record.checkoutTime, "HH:mm") : null,
      branch: record.branch !== "-" ? record.branch : record.defaultBranch,
      status: record.status === "ยังไม่ลงเวลา" ? "มาปกติ" : record.status, 
      fine: record.fine || 0,
      note: record.note,
      shift: record.shift !== '-' ? record.shift : 1 
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
        render: (s) => s !== '-' ? <Tag color="geekblue">กะ {s}</Tag> : '-'
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
        else if (status.includes("ปกติ")) color = "success";
        else if (status.includes("สาย")) color = "warning";
        else if (status.includes("ขาด")) color = "error";
        else if (status.includes("วันหยุด") || status.includes("ผู้บริหาร")) color = "cyan";
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
            <Text type="secondary">ตรวจสอบ/แก้ไข เวลาเช็คอินรายวัน</Text>
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
                        <Option value="มาปกติ">มาปกติ</Option>
                        <Option value="มาสาย (ระดับ 1)">มาสาย (ระดับ 1)</Option>
                        <Option value="มาสาย (ระดับ 2)">มาสาย (ระดับ 2)</Option>
                        <Option value="ขาดงาน/สายมาก">ขาดงาน/สายมาก</Option>
                        <Option value="วันหยุด">วันหยุด</Option>
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