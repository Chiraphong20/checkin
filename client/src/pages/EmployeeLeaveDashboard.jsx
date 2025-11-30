import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Select, Radio, Button, Modal, message, DatePicker, Typography } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { nanoid } from "nanoid";
import dayjs from "dayjs";
import * as XLSX from "xlsx";

const { Option } = Select;
const { Text } = Typography;

// ฟังก์ชันสุ่มสี
const getDistinctColor = (index) => {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 65%, 45%)`;
};

export default function EmployeeLeaveCalendar() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [leaveType, setLeaveType] = useState("single");
  const [loading, setLoading] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [editDate, setEditDate] = useState(null);

  /* โหลดพนักงาน */
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(collection(db, "employees"));
        const list = snapshot.docs.map((doc, index) => ({
          id: doc.id,
          ...doc.data(),
          color: doc.data().color || getDistinctColor(index),
        }));
        setEmployees(list);
      } catch (err) {
        console.error("Error fetching employees:", err);
      }
    };
    fetchEmployees();
  }, []);

  /* โหลดวันลา */
const fetchLeave = async () => {
  try {
    const leaveSnap = await getDocs(collection(db, "employee_leave"));
    const leaveEvents = leaveSnap.docs.map(docItem => {
      const d = docItem.data();
      // หา object employee จาก id
      const emp = employees.find(e => e.id === d.employeeId);
      return {
        id: d.eventId || docItem.id,
        title: emp ? emp.name : "ไม่ทราบชื่อ",  // <-- แก้ตรงนี้
        start: d.date,
        color: emp ? emp.color : "#808080",
        extendedProps: { 
          dbId: docItem.id,
          employeeId: d.employeeId 
        }
      };
    });
    setEvents(leaveEvents);
  } catch (err) {
    message.error("โหลดข้อมูลวันลาไม่สำเร็จ");
  }
};


useEffect(() => {
  if (employees.length > 0) fetchLeave();
}, [employees]);


  /* Helper: ตรวจวันซ้ำ */
  const alreadyHasLeave = (employeeName, date) =>
    events.some(ev => ev.title === employeeName && ev.start === date);

  /* เพิ่มวันลา Local */
  const addLocalEvent = (dateStr) => {
    if (selectedEmployees.length === 0) {
      return message.warning("กรุณาเลือกพนักงานก่อน");
    }

    let newEvents = [...events];
    let addedCount = 0;

    selectedEmployees.forEach(emp => {
      if (!alreadyHasLeave(emp.name, dateStr)) {
        newEvents.push({
          id: nanoid(),
          title: emp.name,
          start: dateStr,
          color: emp.color,
          extendedProps: { dbId: null, employeeId: emp.id } 
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      setEvents(newEvents);
      message.success(`เพิ่ม ${addedCount} รายการ (รอกดบันทึก)`);
    }
  };

  /* ฟังก์ชัน Export Excel */
  const handleExportExcel = () => {
    if (events.length === 0) {
      return message.warning("ไม่มีข้อมูลให้ Export");
    }

    const dataToExport = events.map((ev) => ({
      "ชื่อพนักงาน": ev.title,
      "วันที่ลา": ev.start,
      "สถานะ": ev.extendedProps.dbId ? "บันทึกแล้ว" : "รอ Save (Draft)",
      "Employee ID": ev.extendedProps.employeeId
    }));

    dataToExport.sort((a, b) => new Date(a["วันที่ลา"]) - new Date(b["วันที่ลา"]));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ข้อมูลวันลา");

    const wscols = [
        { wch: 20 }, 
        { wch: 15 }, 
        { wch: 15 }, 
        { wch: 20 }, 
    ];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, `Leave_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
    message.success("ดาวน์โหลด Excel สำเร็จ!");
  };

  /* Event Handlers */
  const handleDateClick = (info) => addLocalEvent(info.dateStr);

  const handleSelect = (info) => {
    let curr = new Date(info.startStr);
    const endDate = new Date(info.endStr);
    while (curr < endDate) {
      const d = curr.toISOString().split("T")[0];
      addLocalEvent(d);
      curr.setDate(curr.getDate() + 1);
    }
  };

  const handleSaveNewEvents = async () => {
    const eventsToSave = events.filter(ev => ev.extendedProps.dbId === null);
    if (eventsToSave.length === 0) return message.info("ไม่มีข้อมูลใหม่ให้บันทึก");

    setLoading(true);
    try {
      const promises = eventsToSave.map(async (ev) => {
        await addDoc(collection(db, "employee_leave"), {
          employeeId: ev.extendedProps.employeeId,
          employeeName: ev.title,
          employeeColor: ev.color,
          date: ev.start,
          eventId: ev.id,
          createdAt: new Date().toISOString()
        });
      });
      await Promise.all(promises);
      message.success("บันทึกข้อมูลเรียบร้อย");
      await fetchLeave(); 
    } catch (err) {
      Modal.error({ title: "บันทึกไม่สำเร็จ", content: err.message });
    }
    setLoading(false);
  };

  const handleEventDrop = async (dropInfo) => {
    const { event } = dropInfo;
    const newDate = event.startStr;
    const dbId = event.extendedProps.dbId;

    const isDuplicate = events.some(ev => 
      ev.id !== event.id && ev.title === event.title && ev.start === newDate
    );

    if (isDuplicate) {
      dropInfo.revert();
      return message.warning("พนักงานคนนี้มีวันลาในวันนี้แล้ว");
    }

    setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, start: newDate } : ev));

    if (dbId) {
      try {
        await updateDoc(doc(db, "employee_leave", dbId), { date: newDate });
        message.success("ย้ายวันลาเรียบร้อย");
      } catch (err) {
        dropInfo.revert();
        message.error("เกิดข้อผิดพลาดในการอัปเดต");
        fetchLeave();
      }
    }
  };

  const handleEventClick = (info) => {
    const eventObj = {
      id: info.event.id,
      title: info.event.title,
      start: info.event.startStr,
      dbId: info.event.extendedProps.dbId
    };
    setCurrentEvent(eventObj);
    setEditDate(dayjs(info.event.startStr));
    setIsEditModalOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (!currentEvent) return;
    if (currentEvent.dbId) {
      try {
        await deleteDoc(doc(db, "employee_leave", currentEvent.dbId));
        message.success("ลบข้อมูลจากฐานข้อมูลแล้ว");
        setEvents(prev => prev.filter(ev => ev.id !== currentEvent.id));
      } catch (err) {
        message.error("ลบไม่สำเร็จ: " + err.message);
      }
    } else {
      setEvents(prev => prev.filter(ev => ev.id !== currentEvent.id));
      message.info("ลบรายการที่ยังไม่บันทึกออกแล้ว");
    }
    setIsEditModalOpen(false);
  };

  const handleUpdateDateFromModal = async () => {
    if (!currentEvent || !editDate) return;
    const newDateStr = editDate.format("YYYY-MM-DD");
    if (newDateStr === currentEvent.start) return setIsEditModalOpen(false);

    const isDuplicate = events.some(ev => 
      ev.id !== currentEvent.id && ev.title === currentEvent.title && ev.start === newDateStr
    );

    if (isDuplicate) return message.warning("วันนี้มีการลาอยู่แล้ว");

    setEvents(prev => prev.map(ev => ev.id === currentEvent.id ? { ...ev, start: newDateStr } : ev));

    if (currentEvent.dbId) {
      try {
        await updateDoc(doc(db, "employee_leave", currentEvent.dbId), { date: newDateStr });
        message.success("แก้ไขวันที่เรียบร้อย");
      } catch (err) {
        message.error("แก้ไขไม่สำเร็จ");
        fetchLeave(); 
      }
    }
    setIsEditModalOpen(false);
  };

  return (
    // 🔽 1. ปรับ Container หลักให้เต็มจอ (ลบ maxWidth: 900 ออก)
    <div style={{ width: "100%", padding: "0px", boxSizing: "border-box" }}>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: 20 }}>

     <Select
  mode="multiple"
  showSearch
  // ใช้ label ของ Option ในการกรอง (ปลอดภัยกว่า children)
  filterOption={(input, option) => {
    const label = (option && option.label) ? String(option.label) : "";
    return label.toLowerCase().includes(String(input).toLowerCase());
  }}
  style={{ width: 300 }}
  placeholder="เลือกพนักงานที่ต้องการเพิ่มวันลา"
  value={selectedEmployees.map(e => e.id)}
  onChange={(values) => setSelectedEmployees(employees.filter(emp => values.includes(emp.id)))}
>
  {employees.map(emp => (
    // ตั้ง prop label เป็นชื่อ เพื่อให้ filterOption ใช้อ่านได้เสมอเป็น string
    <Option key={emp.id} value={emp.id} label={emp.name}>
      <span style={{ marginRight: 8, color: emp.color }}>●</span>
      {emp.name}
    </Option>
  ))}
</Select>



        <Radio.Group 
          value={leaveType} 
          onChange={(e) => setLeaveType(e.target.value)}
          buttonStyle="solid"
        >
          <Radio.Button value="single">วันเดียว</Radio.Button>
          <Radio.Button value="range">ช่วงเวลา (ลากคลุม)</Radio.Button>
        </Radio.Group>

        <Button 
          type="primary" 
          onClick={handleSaveNewEvents} 
          loading={loading}
          disabled={events.filter(ev => ev.extendedProps.dbId === null).length === 0}
        >
          บันทึกวันลา ({events.filter(ev => ev.extendedProps.dbId === null).length})
        </Button>

        <Button 
          icon={<FileExcelOutlined />} 
          onClick={handleExportExcel}
          style={{ backgroundColor: '#217346', color: 'white', borderColor: '#217346' }}
        >
          นำออกเป็น Excel
        </Button>
      </div>

      {/* Calendar */}
      <div style={{ 
          background: '#fff', 
          padding: 16, 
          borderRadius: 8, 
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          // 🔽 2. ปรับปฏิทินให้เต็มพื้นที่ (ลบ Fixed Width ออก)
          width: '100%', 
          // maxWidth: '1200px', // เอาออกเพื่อให้ขยายเต็มที่
          overflowX: 'auto'
      }}>
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          selectable={leaveType === "range"}
          selectMirror={true}
          dateClick={leaveType === "single" ? handleDateClick : null}
          select={leaveType === "range" ? handleSelect : null}
          events={events}
          editable={true}
          eventDrop={handleEventDrop}
          eventClick={handleEventClick}
          height="70vh" // ใช้ความสูงตามขนาดหน้าจอ (Viewport Height)
        />
      </div>

      {/* Modal */}
      <Modal
        title="จัดการวันลา"
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        footer={[
          <Button key="delete" danger onClick={handleDeleteEvent}>
            ลบรายการ
          </Button>,
          <Button key="cancel" onClick={() => setIsEditModalOpen(false)}>
            ยกเลิก
          </Button>,
          <Button key="save" type="primary" onClick={handleUpdateDateFromModal}>
            บันทึกการแก้ไข
          </Button>,
        ]}
      >
        {currentEvent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Text type="secondary">พนักงาน:</Text>
              <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{currentEvent.title}</div>
            </div>
            <div>
              <Text type="secondary">วันที่:</Text>
              <div>
                <DatePicker 
                  value={editDate} 
                  onChange={(date) => setEditDate(date)} 
                  style={{ width: '100%' }} 
                  allowClear={false}
                />
              </div>
            </div>
            {!currentEvent.dbId && (
              <Text type="warning" style={{ fontSize: '0.85em' }}>
                * รายการนี้ยังไม่ได้บันทึกลงฐานข้อมูล (อยู่ในสถานะรอ Save)
              </Text>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}