// EmployeeLeaveDashboard.jsx
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
  Tooltip
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
  InfoCircleOutlined
} from "@ant-design/icons";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { nanoid } from "nanoid";
import dayjs from "dayjs";

const { Option } = Select;
const { Text } = Typography;
const { RangePicker } = DatePicker;

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

// Helper: เลือกสีตามประเภทการลา
const getEventColor = (type, isHoliday) => {
  if (isHoliday) return "#ffccc7"; // สีแดงอ่อน (วันหยุดนักขัตฤกษ์)
  switch (type) {
    case "ลาป่วย": return "#1890ff"; // น้ำเงิน
    case "ลากิจ": return "#52c41a";  // เขียว
    case "พักร้อน": return "#faad14"; // ส้ม
    case "หยุด": return "#ff4d4f";   // สีแดงเข้ม (หยุดงาน/ขาดงาน)
    case "หยุดชดเชย": return "#722ed1"; // สีม่วง
    default: return "#808080";       // เทา
  }
};

export default function EmployeeLeaveDashboard() {
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]); // เก็บรายชื่อสาขา
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // State สำหรับจัดการวันหยุด (Holidays)
  const [holidaysList, setHolidaysList] = useState([]);
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);
  
  // State สำหรับ Form เพิ่ม/แก้ไข วันหยุด
  const [newHolidayRange, setNewHolidayRange] = useState(null); 
  const [newHolidayName, setNewHolidayName] = useState("");
  const [selectedBranchesForHoliday, setSelectedBranchesForHoliday] = useState([]); 
  const [allowSales, setAllowSales] = useState(false); 
  const [processingHoliday, setProcessingHoliday] = useState(false);

  // State สำหรับโหมดแก้ไขวันหยุด
  const [editingHolidayId, setEditingHolidayId] = useState(null);

  // Modal State (Leave Edit - ลงวันลา)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [editDate, setEditDate] = useState(null);
  const [editLeaveType, setEditLeaveType] = useState("ลากิจ");
  const [editStatus, setEditStatus] = useState("Pending");

  // 1. โหลดข้อมูลพนักงาน และ สาขา
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        // A. โหลดพนักงาน (รวมสาขา/branches)
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((doc) => {
          const d = doc.data();
          const branchesField = d.branches || (d.branch ? [d.branch] : []);
          // เราเก็บ branchId เป็นชื่อ/ID ของสาขา (สมมติว่าใน DB เก็บเป็น id ของสาขา)
          const primaryBranch = Array.isArray(branchesField) && branchesField.length > 0 ? branchesField[0] : (d.branch || null);
          return {
            id: doc.id,
            employeeId: d.employeeId || doc.id,
            name: d.name,
            department: d.department || "",
            branches: Array.isArray(branchesField) ? branchesField : (branchesField ? [branchesField] : []),
            branchId: primaryBranch // สาขาหลัก (ใช้เพื่อเช็คสิทธิ์)
          };
        });
        setEmployees(empList);

        // B. โหลดสาขา (เพื่อใช้ใน Dropdown เลือกวันหยุด)
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

  // 2. โหลดข้อมูล (วันลา + วันหยุด)
  const fetchData = async () => {
    setLoading(true);
    try {
      const leaveSnap = await getDocs(collection(db, "employee_leave"));
      
      const qHoliday = query(collection(db, "public_holidays"), orderBy("date", "asc"));
      const holidaySnap = await getDocs(qHoliday);

      // A. ประมวลผลวันหยุด (แต่ละ doc = หนึ่งวัน)
      const holidaysData = holidaySnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
      }));
      setHolidaysList(holidaysData);

      // สร้าง events ของวันหยุด (background)
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
            targetBranches: (h.targetBranches && h.targetBranches !== "ALL") ? h.targetBranches : "ALL",
            allowSales: !!h.allowSales
        }
      }));
      
      // B. ประมวลผลวันลา (จาก employee_leave)
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

      // C. คำนวณวันหยุดชดเชย (per-date logic)
      // For each holiday record (each date), if targetBranches != "ALL" and some branches stopped,
      // then any Sales/Transport whose branch is NOT included for that date -> earn compensatory for that date (if date is past)
      const compensatoryEvents = [];
      const today = dayjs().startOf('day');

      holidaysData.forEach(h => {
        // if ALL -> nobody gets compensatory
        const target = (h.targetBranches && h.targetBranches !== "ALL") ? h.targetBranches : null;
        if (!target || !Array.isArray(target) || target.length === 0) {
          // target === null means ALL or unspecified -> skip
          return;
        }

        // there are some branches that stopped on this date
        const stoppedSet = new Set(target); // branch IDs that stopped this specific date
        const dateStr = h.date;
        if (!dayjs(dateStr).isBefore(today, 'day')) {
          // only award compensatory for past dates
          return;
        }

        // for each employee who is Sales/Transport (03/04) and whose branchId is not in stoppedSet
        employees.forEach(emp => {
          if (!emp.branchId) return;
          if (!["03", "04"].includes(emp.department)) return; // only Sales/Transport
          if (!stoppedSet.has(emp.branchId)) {
            // ensure not duplicate: might have same compensatory event previously in list (check by employeeId+date)
            const exists = compensatoryEvents.some(ev => ev.extendedProps.employeeId === emp.employeeId && ev.start === dateStr);
            if (!exists) {
              compensatoryEvents.push({
                id: `comp-${emp.employeeId}-${dateStr}`,
                title: `${emp.name} (หยุดชดเชย)`,
                start: dateStr,
                backgroundColor: getEventColor("หยุดชดเชย", false),
                borderColor: getEventColor("หยุดชดเชย", false),
                textColor: "#fff",
                extendedProps: {
                  isHoliday: false,
                  isCompensatory: true,
                  earned: true, // marker: เป็นสิทธิ์ที่ได้ ไม่ใช่การลาใช้จริง
                  employeeId: emp.employeeId,
                  type: "หยุดชดเชย",
                  status: "Available"
                }
              });
            }
          }
        });
      });

      setEvents([...holidayEvents, ...leaveEvents, ...compensatoryEvents]);

    } catch (err) {
      console.error(err);
      message.error("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // รีโหลดเมื่อ fetchMasterData เสร็จ (employees ถูกตั้งค่า)
  useEffect(() => {
    if (employees.length > 0) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  // --- Reset Form Function ---
  const resetHolidayForm = () => {
      setNewHolidayRange(null);
      setNewHolidayName("");
      setSelectedBranchesForHoliday([]);
      setAllowSales(false);
      setEditingHolidayId(null);
  };

  // 3. เพิ่มวันหยุด (Create) - บันทึกทีละวันตามช่วงเวลา
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

          // วนลูปบันทึกทีละวัน เพื่อให้การคำนวณวันหยุดชดเชยง่ายขึ้น
          while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
              const dateStr = current.format("YYYY-MM-DD");
              
              promises.push(addDoc(collection(db, "public_holidays"), {
                  date: dateStr,
                  title: newHolidayName,
                  // ถ้า array ว่าง = หยุดทุกสาขา -> "ALL"
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
          console.error(e);
          message.error("เพิ่มวันหยุดไม่สำเร็จ");
      } finally {
          setProcessingHoliday(false);
      }
  };

  // 4. อัปเดตวันหยุด (Update)
  const handleUpdateHoliday = async () => {
      if (!editingHolidayId || !newHolidayRange || !newHolidayName) return;

      // กรณีแก้ไข อนุญาตให้แก้วันที่ของรายการนั้นๆ (ใช้ค่าแรกของ Range)
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
          console.error(e);
          message.error("แก้ไขไม่สำเร็จ");
      } finally {
          setProcessingHoliday(false);
      }
  };

  // เริ่มต้นแก้ไข (ดึงข้อมูลมาใส่ Form)
  const startEditHoliday = (item) => {
      setEditingHolidayId(item.id);
      setNewHolidayRange([dayjs(item.date), dayjs(item.date)]); 
      setNewHolidayName(item.title);
      setSelectedBranchesForHoliday(item.targetBranches === "ALL" ? [] : item.targetBranches);
      setAllowSales(item.allowSales || false);
  };

  // 5. ลบวันหยุด (Delete)
  const handleDeleteHoliday = async (id) => {
      try {
          await deleteDoc(doc(db, "public_holidays", id));
          message.success("ลบวันหยุดแล้ว");
          if (editingHolidayId === id) resetHolidayForm();
          fetchData();
      } catch (e) {
          console.error(e);
          message.error("ลบไม่สำเร็จ");
      }
  };

  // 6. คลิกวันที่บนปฏิทิน (เพิ่มวันลาให้พนักงาน)
  const handleDateSelect = (selectInfo) => {
    if (selectedEmployees.length === 0) {
      message.warning("กรุณาเลือกพนักงานก่อน");
      selectInfo.view.calendar.unselect();
      return;
    }

    let current = dayjs(selectInfo.startStr);
    const end = dayjs(selectInfo.endStr); 
    const newEvents = [];

    while (current.isBefore(end)) {
        const dateStr = current.format("YYYY-MM-DD");
        // หา holiday ในวันนั้น (ถ้ามี)
        const holidayEvent = events.find(ev => ev.start === dateStr && ev.extendedProps?.isHoliday);
        const isHoliday = !!holidayEvent;

        selectedEmployees.forEach((empId) => {
            const emp = employees.find((e) => e.id === empId);
            if (!emp) return;

            // เช็คสิทธิ์: Office (01,02) ได้หยุดแน่ๆ
            // Sales/Transport (03,04) ได้หยุดถ้า holiday applies to their branch และ allowSales === true
            let defaultType = "ลากิจ";
            let createEvent = true;

            if (isHoliday) {
              const hProps = holidayEvent.extendedProps;
              // branches for this holiday (either "ALL" or array of branch IDs)
              const targetBranches = hProps.targetBranches === "ALL" ? "ALL" : hProps.targetBranches;

              // Office always get holiday
              if (["01", "02"].includes(emp.department)) {
                defaultType = "หยุดนักขัตฤกษ์";
              } else if (["03", "04"].includes(emp.department)) {
                // sales/transport
                const branchApplies = (targetBranches === "ALL") || (Array.isArray(targetBranches) && targetBranches.includes(emp.branchId));
                if (branchApplies && hProps.allowSales) {
                  defaultType = "หยุดนักขัตฤกษ์";
                } else {
                  // sales/transport in this branch must work -> do not auto-create a holiday event
                  createEvent = false;
                }
              } else {
                // other depts keep as default (ลากิจ) or skip
                createEvent = false;
              }
            } else {
              // not holiday => use default "ลากิจ" (admin chooses)
              defaultType = "ลากิจ";
            }

            if (createEvent) {
              // Avoid duplicate on same id+date for the same emp
              const exists = events.some(ev => ev.start === dateStr && ev.extendedProps?.employeeId === emp.employeeId && !ev.extendedProps?.isHoliday);
              if (!exists) {
                newEvents.push({
                    id: nanoid(),
                    title: `${emp.name} (${defaultType})`,
                    start: dateStr,
                    backgroundColor: getEventColor(defaultType, false),
                    borderColor: getEventColor(defaultType, false),
                    textColor: "#fff",
                    extendedProps: { 
                        employeeId: emp.employeeId,
                        status: "Approved",
                        type: defaultType,
                        isHoliday: false
                    },
                });
              }
            }
        });

        current = current.add(1, 'day');
    }

    setEvents(prev => [...prev, ...newEvents]);
  };

  // 7. คลิก Event เพื่อแก้ไข
  const handleEventClick = (info) => {
    const props = info.event.extendedProps;

    if (props.isHoliday) {
        // แสดงรายละเอียดวันหยุด
        const targets = props.targetBranches === "ALL" 
            ? "ทุกสาขา" 
            : Array.isArray(props.targetBranches) 
                ? props.targetBranches.map(bid => branches.find(b=>b.id===bid)?.name).join(", ") 
                : "ไม่ระบุ";
        
        const salesAllowedText = props.allowSales ? "✅ พนักงานขาย/ขนส่ง หยุดได้" : "❌ พนักงานขาย/ขนส่ง ต้องทำงาน";

        Modal.info({
            title: `รายละเอียดวันหยุด: ${info.event.title}`,
            content: (
                <div>
                    <p>วันที่: {dayjs(info.event.start).format("DD/MM/YYYY")}</p>
                    <p>สาขาที่หยุด: <b>{targets}</b></p>
                    <p>เงื่อนไขพิเศษ: <b>{salesAllowedText}</b></p>
                    <p style={{color:'#999', fontSize:12, marginTop: 10}}>
                        *หากสาขาไม่ได้หยุด พนักงานสาขานั้นจะได้วันหยุดชดเชยสะสมแทน
                    </p>
                </div>
            )
        });
        return;
    }

    // ถ้าเป็น compensatory (earned) ให้โชว์รายละเอียด ไม่เปิด modal แก้ไขแบบวันลา
    if (props.isCompensatory) {
      const emp = employees.find(e => e.employeeId === props.employeeId);
      Modal.info({
        title: `สิทธิ์หยุดชดเชย: ${emp ? emp.name : props.employeeId}`,
        content: (
          <div>
            <p>วันที่ได้สิทธิ์: {dayjs(info.event.start).format("DD/MM/YYYY")}</p>
            <p>สถานะ: <b>{props.status || 'Available'}</b></p>
            <p style={{color:'#999', fontSize:12, marginTop: 10}}>
              *รายการนี้เป็นสิทธิ์ที่ได้ (earned) ยังไม่ได้ถูกบันทึกเป็นวันลา หากต้องการใช้ให้สร้างวันลาใหม่โดยเลือกวันที่นั้นแล้วกด "บันทึกวันลาพนักงาน"
            </p>
          </div>
        )
      });
      return;
    }

    // เปิด Modal แก้ไขวันลาปกติ
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

  // 8. บันทึกวันลาพนักงานลง DB
  const handleSaveNewEvents = async () => {
    // Drafts = events that are not holidays and not DB items
    // IMPORTANT: exclude earned compensatory events (we don't auto-save them as leave)
    const drafts = events.filter((ev) => 
      !ev.extendedProps?.dbId && 
      !ev.extendedProps?.isHoliday &&
      !(ev.extendedProps?.isCompensatory && ev.extendedProps?.earned)
    );

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
      console.error(err);
      message.error("บันทึกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // 9. อัปเดต/ลบ วันลาพนักงาน
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
            <Text type="secondary" style={{ fontSize: 12 }}>* ⭐ คือผู้มีสิทธิ์หยุดวันนักขัตฤกษ์ (Office)</Text>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                <div style={{ width: 12, height: 12, background: '#ffccc7', borderRadius: '50%' }}></div> <Text>วันหยุด</Text>
                <div style={{ width: 12, height: 12, background: '#1890ff', borderRadius: '50%' }}></div> <Text>ป่วย</Text>
                <div style={{ width: 12, height: 12, background: '#52c41a', borderRadius: '50%' }}></div> <Text>กิจ</Text>
                <div style={{ width: 12, height: 12, background: '#faad14', borderRadius: '50%' }}></div> <Text>พักร้อน</Text>
                <div style={{ width: 12, height: 12, background: '#722ed1', borderRadius: '50%' }}></div> <Text>หยุดชดเชย</Text>
            </div>
         </div>
      </div>

      <Spin spinning={loading}>
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
                     {/* ใช้ RangePicker เพื่อเลือกช่วงวันหยุด */}
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
                    <Text strong>สาขาที่หยุด (ถ้าว่าง = หยุดทุกสาขา):</Text>
                    <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="เลือกสาขาที่ร้านปิด (ปล่อยว่าง = ปิดทุกสาขา)"
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
                    <Tooltip title="ถ้าติ๊ก = พนักงานขาย/ขนส่ง ในสาขาที่หยุด จะได้หยุดด้วย (ถ้าไม่ติ๊ก = ต้องมาทำงาน)">
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
                                        {item.targetBranches === "ALL" || !item.targetBranches || item.targetBranches.length === 0
                                            ? <Tag color="green">หยุดทุกสาขา</Tag>
                                            : Array.isArray(item.targetBranches) && item.targetBranches.map(bid => {
                                                const bName = branches.find(b => b.id === bid)?.name || bid;
                                                return <Tag key={bid} color="blue" icon={<ShopOutlined />}>{bName}</Tag>
                                            })
                                        }
                                        {/* Tag บอกสถานะ Sales */}
                                        {item.allowSales 
                                            ? <Tag color="purple" icon={<UsergroupAddOutlined />}>Sales หยุดได้</Tag>
                                            : <Tag color="default">Sales ต้องมาทำงาน</Tag>
                                        }
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
