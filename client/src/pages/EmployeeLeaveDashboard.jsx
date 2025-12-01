import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
// ✅ เพิ่ม Spin เข้าไปในบรรทัดนี้ครับ
import { Select, Button, Modal, message, DatePicker, Typography, Form, Space, Input, List, Popconfirm, Card, AutoComplete, Spin } from "antd";
import { SaveOutlined, DeleteOutlined, CalendarOutlined, PlusOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { nanoid } from "nanoid";
import dayjs from "dayjs";

const { Option } = Select;
const { Text, Title } = Typography;

// 🔥 รายชื่อวันหยุดมาตรฐานสำหรับ Dropdown (AutoComplete)
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

// Helper: เลือกสีตามประเภทการลา
const getEventColor = (type, isHoliday) => {
  if (isHoliday) return "#ffccc7"; // สีแดงอ่อน (วันหยุดนักขัตฤกษ์)
  switch (type) {
    case "ลาป่วย": return "#1890ff"; // น้ำเงิน
    case "ลากิจ": return "#52c41a";  // เขียว
    case "พักร้อน": return "#faad14"; // ส้ม
    case "ขาดงาน": return "#ff4d4f"; // แดงเข้ม
    default: return "#808080";       // เทา
  }
};

export default function EmployeeLeaveCalendar() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // State สำหรับจัดการวันหยุด (Holidays)
  const [holidaysList, setHolidaysList] = useState([]);
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState(null);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [addingHoliday, setAddingHoliday] = useState(false);

  // Modal State (Leave Edit)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [editDate, setEditDate] = useState(null);
  const [editLeaveType, setEditLeaveType] = useState("ลากิจ");
  const [editStatus, setEditStatus] = useState("Pending");

  // 1. โหลดข้อมูลพนักงาน
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "employees"));
        const empList = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          employeeId: doc.data().employeeId,
          name: doc.data().name,
          department: doc.data().department || "", 
        }));
        setEmployees(empList);
      } catch (err) {
        message.error("โหลดข้อมูลพนักงานไม่สำเร็จ");
      }
    };
    fetchEmployees();
  }, []);

  // 2. โหลดข้อมูล (วันลา + วันหยุด)
  const fetchData = async () => {
    setLoading(true);
    try {
      // โหลดวันลา
      const leaveSnap = await getDocs(collection(db, "employee_leave"));
      
      // โหลดวันหยุด (เรียงตามวันที่)
      const qHoliday = query(collection(db, "public_holidays"), orderBy("date", "asc"));
      const holidaySnap = await getDocs(qHoliday);

      // A. ประมวลผลวันหยุด
      const holidaysData = holidaySnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
      }));
      setHolidaysList(holidaysData);

      const holidayEvents = holidaysData.map(h => ({
        id: h.id,
        title: `🔴 ${h.title}`,
        start: h.date,
        allDay: true,
        backgroundColor: "#eaada8ff", 
        borderColor: "#ffa39e",
        textColor: "#cf1322",       
        display: "background",      
        extendedProps: { isHoliday: true, title: h.title, dbId: h.id }
      }));
      
      // B. ประมวลผลวันลา
      const leaveEvents = leaveSnap.docs.map((docItem) => {
        const d = docItem.data();
        const emp = employees.find((e) => e.employeeId === d.employeeId);
        const type = d.type || "ลากิจ";
        const color = getEventColor(type, false);

        return {
          id: d.eventId || docItem.id,
          title: `${emp ? emp.name : "Unknown"} (${type})`,
          start: d.date,
          backgroundColor: color,
          borderColor: color,
          textColor: "#fff",
          extendedProps: {
            dbId: docItem.id,
            employeeId: d.employeeId,
            type: type,
            status: d.status || "Pending",
            isHoliday: false
          },
        };
      });

      setEvents([...holidayEvents, ...leaveEvents]);

    } catch (err) {
      console.error(err);
      message.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employees.length > 0) fetchData();
  }, [employees]);

  // 3. เพิ่มวันหยุดนักขัตฤกษ์ (Auto Complete)
  const handleAddHoliday = async () => {
      if (!newHolidayDate || !newHolidayName) {
          return message.warning("กรุณาระบุวันที่และชื่อวันหยุด");
      }
      
      setAddingHoliday(true);
      try {
          await addDoc(collection(db, "public_holidays"), {
              date: newHolidayDate.format("YYYY-MM-DD"),
              title: newHolidayName, // บันทึกค่าตามที่พิมพ์หรือเลือก
              createdAt: new Date().toISOString()
          });
          message.success("เพิ่มวันหยุดเรียบร้อย");
          setNewHolidayDate(null);
          setNewHolidayName(""); // Reset
          fetchData(); 
      } catch (e) {
          message.error("เพิ่มวันหยุดไม่สำเร็จ");
      } finally {
          setAddingHoliday(false);
      }
  };

  // 4. ลบวันหยุด
  const handleDeleteHoliday = async (id) => {
      try {
          await deleteDoc(doc(db, "public_holidays", id));
          message.success("ลบวันหยุดแล้ว");
          fetchData();
      } catch (e) {
          message.error("ลบไม่สำเร็จ");
      }
  };

  // 5. คลิกวันที่บนปฏิทิน (เพิ่มวันลาพนักงาน)
  const handleDateClick = (arg) => {
    if (selectedEmployees.length === 0) {
      message.warning("กรุณาเลือกพนักงานก่อน");
      return;
    }

    const isHoliday = events.some(ev => ev.start === arg.dateStr && ev.extendedProps.isHoliday);

    const newEvents = selectedEmployees.map((empId) => {
      const emp = employees.find((e) => e.id === empId);
      const isPrivileged = ["01", "02"].includes(emp.department);
      
      let defaultType = "ลากิจ";
      if (isHoliday && isPrivileged) defaultType = "หยุดนักขัตฤกษ์";

      return {
        id: nanoid(),
        title: `${emp.name} (${defaultType})`,
        start: arg.dateStr,
        backgroundColor: getEventColor(defaultType, false),
        extendedProps: { 
            employeeId: emp.employeeId, 
            status: "Approved", 
            type: defaultType,
            isHoliday: false
        },
      };
    });

    setEvents([...events, ...newEvents]);
  };

  // 6. คลิก Event เพื่อแก้ไข
  const handleEventClick = (info) => {
    const props = info.event.extendedProps;

    if (props.isHoliday) {
        message.info("กรุณาแก้ไขวันหยุดที่เมนู 'จัดการวันหยุด'");
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

  // 7. บันทึกวันลาพนักงาน
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
      fetchData();
      setSelectedEmployees([]);
    } catch (err) {
      message.error("บันทึกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // 8. อัปเดต/ลบ วันลาพนักงาน
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
        fetchData();
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

  return (
    <div style={{ padding: 20, background: "#fff", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>📅 ปฏิทินวันลา & วันหยุด</Title>
        <Space>
           <Button onClick={() => setIsHolidayManagerOpen(true)} icon={<UnorderedListOutlined />}>
              จัดการวันหยุด ({holidaysList.length})
           </Button>
           <Button type="primary" onClick={handleSaveNewEvents} icon={<SaveOutlined />} loading={loading}>
              บันทึกวันลาพนักงาน
           </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 20, padding: 15, background: "#f6ffed", borderRadius: 8, border: "1px solid #b7eb8f" }}>
         <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: 'center' }}>
            <Text strong>เลือกพนักงาน (เพื่อลงวันลา):</Text>
            <Select
                mode="multiple"
                style={{ width: 300 }}
                placeholder="เลือกพนักงาน..."
                value={selectedEmployees}
                onChange={setSelectedEmployees}
                optionFilterProp="children"
            >
                {employees.map((emp) => (
                <Option key={emp.id} value={emp.id}>
                    {emp.name} {["01", "02"].includes(emp.department) && "⭐"}
                </Option>
                ))}
            </Select>
            <Text type="secondary" style={{ fontSize: 12 }}>* ⭐ คือผู้มีสิทธิ์หยุดวันนักขัตฤกษ์</Text>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                <div style={{ width: 12, height: 12, background: '#ffccc7', borderRadius: '50%' }}></div> <Text>วันหยุด</Text>
                <div style={{ width: 12, height: 12, background: '#1890ff', borderRadius: '50%' }}></div> <Text>ป่วย</Text>
                <div style={{ width: 12, height: 12, background: '#52c41a', borderRadius: '50%' }}></div> <Text>กิจ</Text>
                <div style={{ width: 12, height: 12, background: '#faad14', borderRadius: '50%' }}></div> <Text>พักร้อน</Text>
            </div>
         </div>
      </div>

      <Spin spinning={loading}>
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          height="auto"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,dayGridWeek",
          }}
        />
      </Spin>

      {/* Modal แก้ไขวันลาพนักงาน */}
      <Modal
        title="แก้ไขรายละเอียดวันลา"
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        footer={[
          <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleDeleteEvent}>ลบ</Button>,
          <Button key="cancel" onClick={() => setIsEditModalOpen(false)}>ยกเลิก</Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} onClick={handleUpdateFromModal}>บันทึก</Button>,
        ]}
      >
        {currentEvent && (
          <Form layout="vertical">
            <Form.Item label="พนักงาน">
               <Text strong style={{ fontSize: 16 }}>{currentEvent.title.split('(')[0]}</Text>
            </Form.Item>
            <Form.Item label="วันที่ลา">
               <DatePicker value={editDate} onChange={setEditDate} style={{ width: "100%" }} allowClear={false} />
            </Form.Item>
            <Form.Item label="ประเภทการลา">
               <Select value={editLeaveType} onChange={setEditLeaveType}>
                  <Option value="ลากิจ">ลากิจ</Option>
                  <Option value="ลาป่วย">ลาป่วย</Option>
                  <Option value="พักร้อน">พักร้อน</Option>
                  <Option value="หยุดนักขัตฤกษ์">หยุดนักขัตฤกษ์</Option>
                  <Option value="ขาดงาน">ขาดงาน</Option>
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

      {/* 🔥 Modal จัดการวันหยุดนักขัตฤกษ์ */}
      <Modal
        title="จัดการวันหยุดนักขัตฤกษ์"
        open={isHolidayManagerOpen}
        onCancel={() => setIsHolidayManagerOpen(false)}
        footer={[<Button key="close" onClick={() => setIsHolidayManagerOpen(false)}>ปิด</Button>]}
        width={600}
      >
         {/* ส่วนเพิ่มวันหยุดด้วย AutoComplete */}
         <Card size="small" title="เพิ่มวันหยุดใหม่" style={{ marginBottom: 20, background: '#f9f9f9' }}>
             <Space style={{ width: '100%' }}>
                 <DatePicker 
                    placeholder="เลือกวันที่" 
                    value={newHolidayDate} 
                    onChange={setNewHolidayDate} 
                    style={{ width: 150 }}
                 />
                 
                 {/* 🔥 ตรงนี้เปลี่ยนเป็น AutoComplete */}
                 <AutoComplete
                    style={{ width: 220 }}
                    options={standardHolidays}
                    placeholder="พิมพ์หรือเลือกชื่อวันหยุด..."
                    value={newHolidayName}
                    onChange={(value) => setNewHolidayName(value)}
                    filterOption={(inputValue, option) =>
                        option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                    }
                 />

                 <Button type="primary" icon={<PlusOutlined />} onClick={handleAddHoliday} loading={addingHoliday}>
                    เพิ่ม
                 </Button>
             </Space>
         </Card>

         <Text strong>รายการวันหยุดปีนี้ ({holidaysList.length})</Text>
         <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: 10, border: '1px solid #f0f0f0', borderRadius: 8 }}>
             <List
                dataSource={holidaysList}
                renderItem={item => (
                    <List.Item
                        actions={[
                            <Popconfirm title="ลบวันหยุดนี้?" onConfirm={() => handleDeleteHoliday(item.id)}>
                                <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        ]}
                    >
                        <List.Item.Meta
                            avatar={<CalendarOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />}
                            title={<Text strong>{item.title}</Text>}
                            description={dayjs(item.date).format("DD MMMM YYYY")}
                        />
                    </List.Item>
                )}
             />
         </div>
      </Modal>
    </div>
  );
}