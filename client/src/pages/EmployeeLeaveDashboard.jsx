import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { 
  Select, 
  Button, 
  Modal, 
  message, 
  DatePicker, 
  Typography, 
  Form, 
  Space, 
  Input, 
  List, 
  Popconfirm, 
  Card, 
  AutoComplete, 
  Spin,
  Tag,
  Checkbox,
  Tooltip,
  Row,
  Col,
  Table
} from "antd";
import { 
  SaveOutlined, 
  DeleteOutlined, 
  CalendarOutlined, 
  PlusOutlined, 
  UnorderedListOutlined,
  ShopOutlined,
  UsergroupAddOutlined,
  EditOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  FilterOutlined
} from "@ant-design/icons";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy, query, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { nanoid } from "nanoid";
import dayjs from "dayjs";
import 'dayjs/locale/th';

// CSS สำหรับปรับแต่งปฏิทิน
const calendarStyles = `
  .fc .fc-toolbar-title { font-size: 1.5em; color: #333; font-family: 'Sarabun', sans-serif; }
  .fc .fc-button-primary { background-color: #fff; color: #555; border: 1px solid #d9d9d9; }
  .fc .fc-button-primary:hover { background-color: #f5f5f5; border-color: #d9d9d9; }
  .fc .fc-button-primary:not(:disabled).fc-button-active { background-color: #e6f7ff; color: #1890ff; border-color: #1890ff; }
  .fc-event { border: none; border-radius: 4px; padding: 2px 4px; font-size: 0.85rem; cursor: pointer; }
  .fc-day-today { background-color: #fafafa !important; }
`;

const { Option } = Select;
const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const standardHolidays = [
  { value: "วันขึ้นปีใหม่" },
  { value: "วันมาฆบูชา" },
  { value: "วันจักรี" },
  { value: "วันสงกรานต์" },
  { value: "วันฉัตรมงคล" },
  { value: "วันพืชมงคล" },
  { value: "วันวิสาขบูชา" },
  { value: "วันเฉลิมพระชนมพรรษาพระราชินี" },
  { value: "วันอาสาฬหบูชา" },
  { value: "วันเข้าพรรษา" },
  { value: "วันเฉลิมพระชนมพรรษา ร.10" },
  { value: "วันแม่แห่งชาติ" },
  { value: "วันนวมินทรมหาราช" },
  { value: "วันปิยมหาราช" },
  { value: "วันพ่อแห่งชาติ" },
  { value: "วันรัฐธรรมนูญ" },
  { value: "วันสิ้นปี" },
  { value: "วันหยุดชดเชย" },
  { value: "วันหยุดกรณีพิเศษ" }
];

const getEventColor = (type, isHoliday) => {
  if (isHoliday) return "#ff4d4f";
  switch (type) {
    case "ลาป่วย": return "#3b82f6";
    case "ลากิจ": return "#10b981";
    case "พักร้อน": return "#f59e0b";
    case "หยุด": return "#ef4444";
    case "หยุดชดเชย": return "#8b5cf6";
    default: return "#6b7280";
  }
};

export default function EmployeeLeaveDashboard() {
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [holidaysList, setHolidaysList] = useState([]);
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);
  
  const [newHolidayRange, setNewHolidayRange] = useState(null); 
  const [newHolidayName, setNewHolidayName] = useState("");
  const [selectedBranchesForHoliday, setSelectedBranchesForHoliday] = useState([]); 
  const [allowSales, setAllowSales] = useState(false); 
  const [processingHoliday, setProcessingHoliday] = useState(false);

  const [editingHolidayId, setEditingHolidayId] = useState(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [editDate, setEditDate] = useState(null);
  const [editLeaveType, setEditLeaveType] = useState("หยุด"); // ✅ Default เป็น "หยุด"
  const [editStatus, setEditStatus] = useState("Pending");

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((doc) => ({
          id: doc.id,
          employeeId: doc.data().employeeId,
          name: doc.data().name,
          nickname: doc.data().nickname || "", 
          department: doc.data().department || "", 
        }));
        setEmployees(empList);

        const branchSnap = await getDocs(collection(db, "branches"));
        const branchList = branchSnap.docs.map((doc) => ({
            id: doc.id,
            name: doc.data().name
        }));
        setBranches(branchList);
      } catch (err) {
        message.error("โหลดข้อมูลไม่สำเร็จ");
      }
    };
    fetchMasterData();
  }, []);

  const [leaveDocs, setLeaveDocs] = useState([]);

  // Real-time listeners: propagate changes from any page (e.g. adcheckin) immediately.
  useEffect(() => {
    setLoading(true);
    const qHoliday = query(collection(db, "public_holidays"), orderBy("date", "asc"));
    const unsubHoliday = onSnapshot(qHoliday, (holidaySnap) => {
      setHolidaysList(holidaySnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error(err);
      message.error("โหลดข้อมูลวันหยุดไม่สำเร็จ");
    });

    const unsubLeave = onSnapshot(collection(db, "employee_leave"), (leaveSnap) => {
      setLeaveDocs(leaveSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error(err);
      message.error("โหลดข้อมูลการลาไม่สำเร็จ");
    });

    return () => {
      unsubHoliday();
      unsubLeave();
    };
  }, []);

  useEffect(() => {
    if (employees.length === 0) return;

    const holidayEvents = holidaysList.map(h => ({
      id: h.id,
      title: `🔴 ${h.title}`,
      start: h.date,
      allDay: true,
      backgroundColor: "#fff1f0",
      borderColor: "#ffccc7",
      textColor: "#cf1322",
      display: "background",
      extendedProps: {
          isHoliday: true,
          title: h.title,
          dbId: h.id,
          targetBranches: h.targetBranches || "ALL",
          allowSales: h.allowSales || false
      }
    }));

    const leaveEvents = leaveDocs.map((d) => {
      const emp = employees.find((e) => e.employeeId === d.employeeId);
      const type = d.type || "ลากิจ";
      const color = getEventColor(type, false);
      const displayName = emp ? (emp.nickname || emp.name) : "Unknown";

      return {
        id: d.eventId || d.id,
        title: `${displayName} (${type})`,
        start: d.date,
        backgroundColor: color,
        borderColor: "transparent",
        textColor: "#fff",
        extendedProps: {
          dbId: d.id,
          employeeId: d.employeeId,
          type: type,
          status: d.status || "Pending",
          isHoliday: false
        },
      };
    });

    // Preserve unsaved draft events (created via date-range select, not yet persisted).
    setEvents(prev => {
      const draftEvents = prev.filter(ev => !ev.extendedProps.dbId && !ev.extendedProps.isHoliday);
      return [...holidayEvents, ...leaveEvents, ...draftEvents];
    });
    setLoading(false);
  }, [holidaysList, leaveDocs, employees]);

  const resetHolidayForm = () => {
      setNewHolidayRange(null);
      setNewHolidayName("");
      setSelectedBranchesForHoliday([]);
      setAllowSales(false);
      setEditingHolidayId(null);
  };

  const handleAddHoliday = async () => {
      if (!newHolidayRange || !newHolidayName) {
          return message.warning("กรุณาระบุช่วงวันที่และชื่อวันหยุด");
      }
      
      setProcessingHoliday(true);
      try {
          const [start, end] = newHolidayRange;
          let current = dayjs(start);
          const endDate = dayjs(end);
          const promises = [];

          while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
              const dateStr = current.format("YYYY-MM-DD");
              promises.push(addDoc(collection(db, "public_holidays"), {
                  date: dateStr,
                  title: newHolidayName,
                  targetBranches: selectedBranchesForHoliday.length > 0 ? selectedBranchesForHoliday : "ALL",
                  allowSales: allowSales,
                  createdAt: new Date().toISOString()
              }));
              current = current.add(1, 'day');
          }

          await Promise.all(promises);
          message.success("เพิ่มวันหยุดเรียบร้อย");
          resetHolidayForm();
      } catch (e) {
          message.error("เพิ่มวันหยุดไม่สำเร็จ");
      } finally {
          setProcessingHoliday(false);
      }
  };

  const handleUpdateHoliday = async () => {
      if (!editingHolidayId || !newHolidayRange || !newHolidayName) return;
      const newDateStr = newHolidayRange[0].format("YYYY-MM-DD");

      setProcessingHoliday(true);
      try {
          const docRef = doc(db, "public_holidays", editingHolidayId);
          await updateDoc(docRef, {
              date: newDateStr,
              title: newHolidayName,
              targetBranches: selectedBranchesForHoliday.length > 0 ? selectedBranchesForHoliday : "ALL",
              allowSales: allowSales
          });
          message.success("แก้ไขวันหยุดเรียบร้อย");
          resetHolidayForm();
      } catch (e) {
          message.error("แก้ไขไม่สำเร็จ");
      } finally {
          setProcessingHoliday(false);
      }
  };

  const startEditHoliday = (item) => {
      setEditingHolidayId(item.id);
      setNewHolidayRange([dayjs(item.date), dayjs(item.date)]); 
      setNewHolidayName(item.title);
      setSelectedBranchesForHoliday(item.targetBranches === "ALL" ? [] : item.targetBranches);
      setAllowSales(item.allowSales || false);
  };

  const handleDeleteHoliday = async (id) => {
      try {
          await deleteDoc(doc(db, "public_holidays", id));
          message.success("ลบวันหยุดแล้ว");
          if (editingHolidayId === id) resetHolidayForm();
      } catch (e) {
          message.error("ลบไม่สำเร็จ");
      }
  };

  const handleDateSelect = (selectInfo) => {
    if (selectedEmployees.length === 0) {
      message.warning("กรุณาเลือกพนักงานก่อน");
      selectInfo.view.calendar.unselect();
      return;
    }

    let current = dayjs(selectInfo.startStr);
    const end = dayjs(selectInfo.endStr);
    const newEvents = [];
    let skippedCount = 0;

    while (current.isBefore(end)) {
        const dateStr = current.format("YYYY-MM-DD");
        const holidayEvent = events.find(ev => ev.start === dateStr && ev.extendedProps.isHoliday);
        const isHoliday = !!holidayEvent;

        selectedEmployees.forEach((empId) => {
            const emp = employees.find((e) => e.id === empId);

            // ✅ กันข้อมูลซ้ำ: ข้ามถ้าพนักงานคนนี้มีรายการลา/หยุดในวันนี้อยู่แล้ว
            const alreadyExists =
                events.some(ev => !ev.extendedProps.isHoliday && ev.start === dateStr && ev.extendedProps.employeeId === emp.employeeId) ||
                newEvents.some(ev => ev.start === dateStr && ev.extendedProps.employeeId === emp.employeeId);

            if (alreadyExists) {
                skippedCount++;
                return;
            }

            let privilegedDepts = ["01", "02"];
            if (isHoliday && holidayEvent?.extendedProps.allowSales) {
                privilegedDepts.push("03", "04");
            }

            const isPrivileged = privilegedDepts.includes(emp.department);

            // ✅ Default เป็น "หยุด" ก่อน ถ้าเข้าเงื่อนไขถึงเป็น "หยุดนักขัตฤกษ์"
            let defaultType = "หยุด";
            if (isHoliday && isPrivileged) defaultType = "หยุดนักขัตฤกษ์";

            const displayName = emp.nickname || emp.name;

            newEvents.push({
                id: nanoid(),
                title: `${displayName} (${defaultType})`,
                start: dateStr,
                backgroundColor: getEventColor(defaultType, false),
                borderColor: "transparent",
                extendedProps: {
                    employeeId: emp.employeeId,
                    status: "Approved",
                    type: defaultType,
                    isHoliday: false
                },
            });
        });

        current = current.add(1, 'day');
    }

    if (skippedCount > 0) {
        message.info(`ข้าม ${skippedCount} รายการที่มีข้อมูลอยู่แล้ว เพื่อป้องกันข้อมูลซ้ำ`);
    }

    setEvents([...events, ...newEvents]);
  };

  const handleEventClick = (info) => {
    const props = info.event.extendedProps;

    if (props.isHoliday) {
        const targets = props.targetBranches === "ALL" 
            ? "ทุกสาขา" 
            : Array.isArray(props.targetBranches) 
                ? props.targetBranches.map(bid => branches.find(b=>b.id===bid)?.name).join(", ") 
                : "ไม่ระบุ";
        
        const salesAllowedText = props.allowSales ? "✅ อนุญาต" : "❌ ไม่อนุญาต";

        Modal.info({
            title: `รายละเอียดวันหยุด: ${info.event.title}`,
            content: (
                <div style={{ marginTop: 10 }}>
                    <p><b>วันที่:</b> {dayjs(info.event.start).format("DD MMMM YYYY")}</p>
                    <p><b>สาขาที่หยุด:</b> {targets}</p>
                    <p><b>พนักงานขาย/ขนส่งหยุดได้:</b> {salesAllowedText}</p>
                    <Alert 
                        message="เงื่อนไขชดเชย"
                        description="หากสาขาไม่ได้หยุด หรือพนักงานขายไม่อนุญาตให้หยุด พนักงานที่มาทำงานจะได้วันหยุดชดเชยสะสม"
                        type="info"
                        showIcon
                        style={{ marginTop: 10 }}
                    />
                </div>
            )
        });
        return;
    }

    setCurrentEvent({
      id: info.event.id,
      title: info.event.title,
      start: info.event.startStr,
      dbId: props.dbId,
      type: props.type || "ลากิจ",
      status: props.status || "Pending",
      employeeId: props.employeeId
    });
    setEditDate(dayjs(info.event.startStr));
    setEditLeaveType(props.type || "ลากิจ");
    setEditStatus(props.status || "Pending");
    setIsEditModalOpen(true);
  };

  const handleSaveNewEvents = async () => {
    const drafts = events.filter((ev) => !ev.extendedProps.dbId && !ev.extendedProps.isHoliday);
    if (drafts.length === 0) return message.info("ไม่มีรายการใหม่ให้บันทึก");

    setLoading(true);
    try {
      const promises = drafts.map(async (ev) => {
        const emp = employees.find(e => e.employeeId === ev.extendedProps.employeeId);
        await addDoc(collection(db, "employee_leave"), {
          employeeId: ev.extendedProps.employeeId,
          employeeName: emp ? emp.name : "Unknown",
          date: ev.start,
          eventId: ev.id,
          type: ev.extendedProps.type,
          status: "Approved",
          createdAt: new Date().toISOString(),
        });
      });
      await Promise.all(promises);
      message.success("บันทึกข้อมูลเรียบร้อย");
      setSelectedEmployees([]);
    } catch (err) {
      message.error("บันทึกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateFromModal = async () => {
    if (!currentEvent || !editDate) return;
    const newDateStr = editDate.format("YYYY-MM-DD");

    if (currentEvent.dbId) {
      try {
        await updateDoc(doc(db, "employee_leave", currentEvent.dbId), {
          date: newDateStr,
          type: editLeaveType,
          status: editStatus,
        });
        message.success("อัปเดตข้อมูลสำเร็จ");
      } catch (err) {
        message.error("อัปเดตไม่สำเร็จ");
      }
    } else {
        setEvents(prev => prev.map(ev => ev.id === currentEvent.id ? {
            ...ev,
            start: newDateStr,
            title: ev.title.replace(/\(.*\)/, `(${editLeaveType})`),
            backgroundColor: getEventColor(editLeaveType, false),
            extendedProps: { ...ev.extendedProps, type: editLeaveType, status: editStatus }
        } : ev));
    }
    setIsEditModalOpen(false);
  };

  const handleDeleteEvent = async () => {
    if (!currentEvent) return;
    if (currentEvent.dbId) {
        await deleteDoc(doc(db, "employee_leave", currentEvent.dbId));
        message.success("ลบรายการเรียบร้อย");
    }
    setEvents(prev => prev.filter(ev => ev.id !== currentEvent.id));
    setIsEditModalOpen(false);
  };

  // Render ข้อมูลในตารางวันหยุด
  const holidayColumns = [
      {
          title: 'วันที่',
          dataIndex: 'date',
          key: 'date',
          render: (text) => dayjs(text).format("DD MMM YYYY"),
          width: 120
      },
      {
          title: 'ชื่อวันหยุด',
          dataIndex: 'title',
          key: 'title',
          render: (text) => <Text strong>{text}</Text>
      },
      {
          title: 'สาขาที่หยุด',
          key: 'targetBranches',
          render: (_, record) => (
              <>
                {record.targetBranches === "ALL" || !record.targetBranches || record.targetBranches.length === 0
                    ? <Tag color="green">หยุดทุกสาขา</Tag>
                    : Array.isArray(record.targetBranches) && record.targetBranches.map(bid => {
                        const bName = branches.find(b => b.id === bid)?.name || bid;
                        return <Tag key={bid} color="blue" icon={<ShopOutlined />}>{bName}</Tag>
                    })
                }
              </>
          )
      },
      {
          title: 'Sales หยุด',
          key: 'allowSales',
          width: 100,
          align: 'center',
          render: (_, record) => record.allowSales ? <Tag color="purple">ได้</Tag> : <Tag color="default">ไม่ได้</Tag>
      },
      {
          title: 'จัดการ',
          key: 'action',
          width: 100,
          align: 'center',
          render: (_, record) => (
              <Space>
                  <Button 
                      type="text" 
                      size="small"
                      icon={<EditOutlined style={{ color: '#faad14' }} />} 
                      onClick={() => startEditHoliday(record)} 
                  />
                  <Popconfirm title="ลบวันหยุดนี้?" onConfirm={() => handleDeleteHoliday(record.id)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
              </Space>
          )
      }
  ];

  return (
    <div style={{ padding: 24, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
      <style>{calendarStyles}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, alignItems: 'center' }}>
        <div>
            <Title level={3} style={{ margin: 0 }}>📅 ปฏิทินวันลา & วันหยุด</Title>
            <Text type="secondary">จัดการวันลาพนักงานและกำหนดวันหยุดบริษัท</Text>
        </div>
        <Space>
           <Button onClick={() => setIsHolidayManagerOpen(true)} icon={<UnorderedListOutlined />}>
              จัดการวันหยุด ({holidaysList.length})
           </Button>
           <Button type="primary" onClick={handleSaveNewEvents} icon={<SaveOutlined />} loading={loading} size="large">
              บันทึกการเปลี่ยนแปลง
           </Button>
        </Space>
      </div>

      {/* Control Bar */}
      <Card 
        styles={{ body: { padding: "16px 24px" } }} 
        style={{ marginBottom: 24, borderRadius: 8, background: "#f8f9fa", border: "1px solid #e9ecef" }}
      >
         <Row gutter={[24, 24]} align="middle">
            <Col xs={24} md={10}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FilterOutlined style={{ color: '#888' }} />
                    <Text strong>เลือกพนักงาน:</Text>
                    <Select
                        mode="multiple"
                        style={{ flex: 1 }}
                        placeholder="ค้นหาชื่อ หรือ ชื่อเล่น..."
                        value={selectedEmployees}
                        onChange={setSelectedEmployees}
                        optionFilterProp="children"
                        maxTagCount="responsive"
                    >
                        {employees.map((emp) => (
                        <Option key={emp.id} value={emp.id}>
                            {emp.name} {emp.nickname ? `(${emp.nickname})` : ""} {["01", "02"].includes(emp.department) && "⭐"}
                        </Option>
                        ))}
                    </Select>
                </div>
            </Col>
            <Col xs={24} md={14}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                    <Tag color="#ff4d4f">วันหยุดนักขัตฤกษ์</Tag>
                    <Tag color="#3b82f6">ลาป่วย</Tag>
                    <Tag color="#10b981">ลากิจ</Tag>
                    <Tag color="#f59e0b">พักร้อน</Tag>
                    <Tag color="#8b5cf6">หยุดชดเชย</Tag>
                    <Tag color="#ef4444">หยุด (ปกติ)</Tag>
                </div>
            </Col>
         </Row>
      </Card>

      {/* Calendar Section */}
      <Spin spinning={loading}>
        <div style={{ background: 'white', padding: 10, borderRadius: 8 }}>
            <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={events}
            selectable={true}
            select={handleDateSelect}
            eventClick={handleEventClick}
            height="auto"
            headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,dayGridWeek",
            }}
            buttonText={{
                today: 'วันนี้',
                month: 'เดือน',
                week: 'สัปดาห์'
            }}
            dayMaxEvents={3}
            locale="th"
            />
        </div>
      </Spin>

      {/* Modal แก้ไขวันลาพนักงาน */}
      <Modal
        title={<span><EditOutlined /> แก้ไขรายการลา</span>}
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        footer={[
          <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleDeleteEvent}>ลบรายการ</Button>,
          <Button key="cancel" onClick={() => setIsEditModalOpen(false)}>ยกเลิก</Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} onClick={handleUpdateFromModal}>บันทึกแก้ไข</Button>,
        ]}
      >
        {currentEvent && (
          <Form layout="vertical" style={{ marginTop: 20 }}>
            <Form.Item label="พนักงาน">
               <Input value={currentEvent.title.split('(')[0]} disabled prefix={<UsergroupAddOutlined />} />
            </Form.Item>
            <Form.Item label="วันที่">
               <DatePicker value={editDate} onChange={setEditDate} style={{ width: "100%" }} allowClear={false} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item label="ประเภทการลา">
               <Select value={editLeaveType} onChange={setEditLeaveType}>
                  <Option value="หยุด">หยุด (ปกติ)</Option>
                  <Option value="ลากิจ">ลากิจ</Option>
                  <Option value="ลาป่วย">ลาป่วย</Option>
                  <Option value="พักร้อน">พักร้อน</Option>
                  <Option value="หยุดนักขัตฤกษ์">หยุดนักขัตฤกษ์</Option>
                  <Option value="หยุดชดเชย">หยุดชดเชย</Option>
               </Select>
            </Form.Item>
            <Form.Item label="สถานะการอนุมัติ">
               <Select value={editStatus} onChange={setEditStatus}>
                  <Option value="Pending">รออนุมัติ</Option>
                  <Option value="Approved">อนุมัติแล้ว</Option>
                  <Option value="Rejected">ไม่อนุมัติ</Option>
               </Select>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Modal จัดการวันหยุดนักขัตฤกษ์ */}
      <Modal
        title={<span><CalendarOutlined /> จัดการวันหยุดนักขัตฤกษ์ & วันหยุดร้าน</span>}
        open={isHolidayManagerOpen}
        onCancel={() => setIsHolidayManagerOpen(false)}
        footer={[<Button key="close" onClick={() => setIsHolidayManagerOpen(false)}>ปิดหน้าต่าง</Button>]}
        width={800}
      >
         <Row gutter={[24, 24]}>
             <Col span={24}>
                <Card 
                    size="small" 
                    title={editingHolidayId ? "✏️ แก้ไขวันหยุด" : "➕ เพิ่มวันหยุดใหม่"} 
                    style={{ background: editingHolidayId ? '#fffbe6' : '#f9f9f9', borderColor: editingHolidayId ? '#ffe58f' : '#f0f0f0' }}
                    extra={editingHolidayId && <Button size="small" onClick={resetHolidayForm} icon={<CloseOutlined />}>ยกเลิกแก้ไข</Button>}
                >
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Space style={{ width: '100%' }} wrap>
                            <RangePicker 
                                placeholder={['วันที่เริ่ม', 'วันที่สิ้นสุด']} 
                                value={newHolidayRange} 
                                onChange={setNewHolidayRange} 
                                style={{ width: 240 }}
                                format="DD/MM/YYYY"
                            />
                            
                            <AutoComplete
                                style={{ width: 240 }}
                                options={standardHolidays}
                                placeholder="ชื่อวันหยุด (เช่น วันปีใหม่)"
                                value={newHolidayName}
                                onChange={(value) => setNewHolidayName(value)}
                                filterOption={(inputValue, option) =>
                                    option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                                }
                            />
                        </Space>

                        <div>
                            <Text strong style={{ display: 'block', marginBottom: 5 }}>สาขาที่หยุด (ว่าง = หยุดทุกสาขา):</Text>
                            <Select
                                mode="multiple"
                                style={{ width: '100%' }}
                                placeholder="เลือกสาขาที่ร้านปิด..."
                                value={selectedBranchesForHoliday}
                                onChange={setSelectedBranchesForHoliday}
                                optionFilterProp="children"
                            >
                                {branches.map(b => (
                                    <Option key={b.id} value={b.id}>{b.name}</Option>
                                ))}
                            </Select>
                        </div>

                        <div>
                            <Tooltip title="หากติ๊ก: พนักงานขาย/ขนส่ง ในสาขาที่เลือก จะได้หยุดด้วย">
                                <Checkbox checked={allowSales} onChange={(e) => setAllowSales(e.target.checked)}>
                                    <Space>
                                        <ShopOutlined /> 
                                        อนุญาตให้ <b>พนักงานขาย/ขนส่ง</b> หยุดได้ด้วย 
                                        <InfoCircleOutlined style={{ color: '#1890ff' }} />
                                    </Space>
                                </Checkbox>
                            </Tooltip>
                        </div>

                        <Button 
                            type="primary" 
                            block 
                            icon={editingHolidayId ? <SaveOutlined /> : <PlusOutlined />} 
                            onClick={editingHolidayId ? handleUpdateHoliday : handleAddHoliday} 
                            loading={processingHoliday} 
                            style={{ marginTop: 10 }}
                        >
                            {editingHolidayId ? "บันทึกการแก้ไข" : "เพิ่มวันหยุด (บันทึกรายวัน)"}
                        </Button>
                    </Space>
                </Card>
             </Col>
             
             <Col span={24}>
                <Text strong style={{ fontSize: 16 }}>รายการวันหยุดปีนี้ ({holidaysList.length})</Text>
                <Table 
                    dataSource={holidaysList} 
                    columns={holidayColumns} 
                    rowKey="id" 
                    size="small" 
                    pagination={{ pageSize: 5 }}
                    style={{ marginTop: 10 }}
                />
             </Col>
         </Row>
      </Modal>
    </div>
  );
}