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
  Checkbox 
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
  CloseOutlined 
} from "@ant-design/icons";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { nanoid } from "nanoid";
import dayjs from "dayjs";

const { Option } = Select;
const { Text } = Typography;
const { RangePicker } = DatePicker; // ✅ เรียกใช้ RangePicker

// รายชื่อวันหยุดมาตรฐาน
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
  if (isHoliday) return "#ffccc7"; 
  switch (type) {
    case "ลาป่วย": return "#1890ff"; 
    case "ลากิจ": return "#52c41a";  
    case "พักร้อน": return "#faad14"; 
    case "หยุด": return "#ff4d4f";   
    case "หยุดชดเชย": return "#722ed1"; 
    default: return "#808080";       
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
  
  // ✅ เปลี่ยนจาก Date เดียว เป็น Range (Array)
  const [newHolidayRange, setNewHolidayRange] = useState(null); 
  const [newHolidayName, setNewHolidayName] = useState("");
  const [selectedBranchesForHoliday, setSelectedBranchesForHoliday] = useState([]); 
  const [allowSales, setAllowSales] = useState(false); 
  const [processingHoliday, setProcessingHoliday] = useState(false);

  const [editingHolidayId, setEditingHolidayId] = useState(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [editDate, setEditDate] = useState(null);
  const [editLeaveType, setEditLeaveType] = useState("ลากิจ");
  const [editStatus, setEditStatus] = useState("Pending");

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((doc) => ({
          id: doc.id,
          employeeId: doc.data().employeeId,
          name: doc.data().name,
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const leaveSnap = await getDocs(collection(db, "employee_leave"));
      
      const qHoliday = query(collection(db, "public_holidays"), orderBy("date", "asc"));
      const holidaySnap = await getDocs(qHoliday);

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
        extendedProps: { 
            isHoliday: true, 
            title: h.title, 
            dbId: h.id,
            targetBranches: h.targetBranches || "ALL",
            allowSales: h.allowSales || false
        }
      }));
      
      const leaveEvents = leaveSnap.docs.map((docItem) => {
        const d = docItem.data();
        const emp = employees.find((e) => e.employeeId === d.employeeId);
        const type = d.type || "ลากิจ";
        const color = getEventColor(type, false);

        return {
          id: d.eventId || docItem.id,
          title: `${emp ? emp.name : "Unknown"} (${type})`,
          start: d.date,
          // ถ้ามี end date ก็ใส่เพิ่มได้ (แต่ระบบนี้บันทึกทีละวัน)
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

  const resetHolidayForm = () => {
      setNewHolidayRange(null); // Reset Range
      setNewHolidayName("");
      setSelectedBranchesForHoliday([]);
      setAllowSales(false);
      setEditingHolidayId(null);
  };

  // ✅ 3. เพิ่มวันหยุด (รองรับช่วงเวลา)
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

          // วนลูปบันทึกทีละวัน (เพื่อให้ LeaveBalance คำนวณง่าย)
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
          fetchData(); 
      } catch (e) {
          message.error("เพิ่มวันหยุดไม่สำเร็จ");
      } finally {
          setProcessingHoliday(false);
      }
  };

  // 4. อัปเดตวันหยุด (แก้ได้ทีละวัน)
  const handleUpdateHoliday = async () => {
      if (!editingHolidayId || !newHolidayRange || !newHolidayName) return;

      // กรณีแก้ไข เราอนุญาตให้แก้วันที่ของรายการนั้นๆ (ยังไม่รองรับแก้เป็น Range ทับตัวเดิม เพราะซับซ้อน)
      // ดังนั้นใช้ค่าตัวแรกของ Range มาเป็นวันที่
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
          fetchData();
      } catch (e) {
          message.error("แก้ไขไม่สำเร็จ");
      } finally {
          setProcessingHoliday(false);
      }
  };

  const startEditHoliday = (item) => {
      setEditingHolidayId(item.id);
      // set ค่าใส่ RangePicker (เริ่ม-จบ เป็นวันเดียวกัน)
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
          fetchData();
      } catch (e) {
          message.error("ลบไม่สำเร็จ");
      }
  };

  // ✅ 5. ฟังก์ชัน Select วันที่บนปฏิทิน (ลากคลุมได้)
  const handleDateSelect = (selectInfo) => {
    if (selectedEmployees.length === 0) {
      message.warning("กรุณาเลือกพนักงานก่อน");
      selectInfo.view.calendar.unselect(); // ยกเลิกการเลือก
      return;
    }

    let current = dayjs(selectInfo.startStr);
    const end = dayjs(selectInfo.endStr); // FullCalendar end date is exclusive
    const newEvents = [];

    // วนลูปสร้าง Event สำหรับแต่ละวันในช่วงที่เลือก
    while (current.isBefore(end)) {
        const dateStr = current.format("YYYY-MM-DD");
        
        // เช็คว่าเป็นวันหยุดหรือไม่
        const holidayEvent = events.find(ev => ev.start === dateStr && ev.extendedProps.isHoliday);
        const isHoliday = !!holidayEvent;

        selectedEmployees.forEach((empId) => {
            const emp = employees.find((e) => e.id === empId);
            let privilegedDepts = ["01", "02"]; 
            if (isHoliday && holidayEvent?.extendedProps.allowSales) {
                privilegedDepts.push("03");
            }
            const isPrivileged = privilegedDepts.includes(emp.department); 
            
            let defaultType = "ลากิจ";
            if (isHoliday && isPrivileged) defaultType = "หยุดนักขัตฤกษ์";

            newEvents.push({
                id: nanoid(),
                title: `${emp.name} (${defaultType})`,
                start: dateStr,
                backgroundColor: getEventColor(defaultType, false),
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
        
        const salesAllowedText = props.allowSales ? "✅ พนักงานขายหยุดได้" : "❌ พนักงานขายห้ามหยุด";

        Modal.info({
            title: `รายละเอียดวันหยุด: ${info.event.title}`,
            content: (
                <div>
                    <p>วันที่: {dayjs(info.event.start).format("DD/MM/YYYY")}</p>
                    <p>มีผลกับ: <b>{targets}</b></p>
                    <p>สิทธิ์เพิ่มเติม: <b>{salesAllowedText}</b></p>
                    <p style={{color:'#999', fontSize:12}}>*แก้ไขได้ที่เมนู 'จัดการวันหยุด'</p>
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
      fetchData();
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
                <div style={{ width: 12, height: 12, background: '#ff4d4f', borderRadius: '50%' }}></div> <Text>หยุด/ขาด</Text>
            </div>
         </div>
      </div>

      <Spin spinning={loading}>
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          selectable={true} // ✅ เปิดใช้งานการเลือกแบบ Range
          select={handleDateSelect} // ✅ Callback เมื่อเลือกช่วงเวลา
          // dateClick={handleDateClick} // ❌ ปิด dateClick เพราะใช้ select แทน (คลิกวันเดียว select ก็ทำงาน)
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
                  <Option value="หยุดชดเชย">หยุดชดเชย</Option>
                  <Option value="หยุด">หยุด (ขาดงาน)</Option>
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
        width={700}
      >
         {/* Card สำหรับ เพิ่ม/แก้ไข วันหยุด */}
         <Card 
            size="small" 
            title={editingHolidayId ? "✏️ แก้ไขวันหยุด" : "➕ เพิ่มวันหยุดใหม่"} 
            style={{ marginBottom: 20, background: editingHolidayId ? '#fffbe6' : '#f9f9f9', borderColor: editingHolidayId ? '#ffe58f' : '#f0f0f0' }}
            extra={editingHolidayId && <Button size="small" onClick={resetHolidayForm} icon={<CloseOutlined />}>ยกเลิกแก้ไข</Button>}
         >
             <Space direction="vertical" style={{ width: '100%' }}>
                 <Space style={{ width: '100%' }}>
                     {/* ✅ ใช้ RangePicker แทน DatePicker */}
                     <RangePicker 
                        placeholder={['วันที่เริ่ม', 'วันที่สิ้นสุด']} 
                        value={newHolidayRange} 
                        onChange={setNewHolidayRange} 
                        style={{ width: 220 }}
                     />
                     
                     <AutoComplete
                        style={{ width: 200 }}
                        options={standardHolidays}
                        placeholder="ชื่อวันหยุด..."
                        value={newHolidayName}
                        onChange={(value) => setNewHolidayName(value)}
                        filterOption={(inputValue, option) =>
                            option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                        }
                     />
                 </Space>

                 <div style={{ marginTop: 5 }}>
                    <Text strong>มีผลกับสาขา:</Text>
                    <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="ปล่อยว่าง = หยุดทุกสาขา"
                        value={selectedBranchesForHoliday}
                        onChange={setSelectedBranchesForHoliday}
                        optionFilterProp="children"
                    >
                        {branches.map(b => (
                            <Option key={b.id} value={b.id}>{b.name}</Option>
                        ))}
                    </Select>
                 </div>

                 <div style={{ marginTop: 5 }}>
                    <Checkbox checked={allowSales} onChange={(e) => setAllowSales(e.target.checked)}>
                        <Space><ShopOutlined /> อนุญาตให้ <b>พนักงานขาย</b> หยุดได้</Space>
                    </Checkbox>
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

         <Text strong>รายการวันหยุดปีนี้ ({holidaysList.length})</Text>
         <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: 10, border: '1px solid #f0f0f0', borderRadius: 8 }}>
             <List
                dataSource={holidaysList}
                renderItem={item => (
                    <List.Item
                        actions={[
                            <Button 
                                type="text" 
                                icon={<EditOutlined style={{ color: '#faad14' }} />} 
                                onClick={() => startEditHoliday(item)} 
                            />,
                            <Popconfirm title="ลบวันหยุดนี้?" onConfirm={() => handleDeleteHoliday(item.id)}>
                                <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        ]}
                    >
                        <List.Item.Meta
                            avatar={<CalendarOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />}
                            title={<Text strong>{item.title}</Text>}
                            description={
                                <div>
                                    <div>{dayjs(item.date).format("DD MMMM YYYY")}</div>
                                    <div style={{ marginTop: 4 }}>
                                        {item.targetBranches === "ALL" || !item.targetBranches 
                                            ? <Tag color="green">ทุกสาขา</Tag>
                                            : Array.isArray(item.targetBranches) && item.targetBranches.map(bid => {
                                                const bName = branches.find(b => b.id === bid)?.name || bid;
                                                return <Tag key={bid} color="blue" icon={<ShopOutlined />}>{bName}</Tag>
                                            })
                                        }
                                        {item.allowSales && <Tag color="purple" icon={<UsergroupAddOutlined />}>+พนักงานขาย</Tag>}
                                    </div>
                                </div>
                            }
                        />
                    </List.Item>
                )}
             />
         </div>
      </Modal>
    </div>
  );
}