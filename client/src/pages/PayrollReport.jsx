import React, { useState, useEffect } from 'react';
import {
  Typography, Card, DatePicker, Button, Space, Table, Spin, Alert, Input, Modal, Select, message, Pagination, Tag
} from 'antd';
import {
  SearchOutlined, FileExcelOutlined, FilePdfOutlined
} from '@ant-design/icons';
import {
  getFirestore, collection, getDocs, query, where, orderBy
} from 'firebase/firestore';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { app } from '../firebase';

dayjs.extend(isSameOrBefore);

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Search } = Input;
const { Option } = Select;
const db = getFirestore(app);

const PayrollReport = () => {
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [reportData, setReportData] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [lateDetails, setLateDetails] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [branchOptions, setBranchOptions] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  // 🔹 State สำหรับ Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // โหลดสาขา
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const snap = await getDocs(collection(db, 'branches'));
        const options = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
        setBranchOptions(options);
      } catch (e) {
        console.warn('Cannot load branches');
      }
    };
    loadBranches();
  }, []);

  // 🔹 ฟังก์ชันโหลดฟอนต์ไทย (สำหรับ PDF)
  const ensureThaiFont = async (doc) => {
    const hideLoading = message.loading('กำลังดาวน์โหลดฟอนต์ภาษาไทย...', 0);
    
    const fontUrls = [
      '/THSarabunNew.ttf',
      'https://cdn.jsdelivr.net/npm/font-th-sarabun-new@1.0.0/fonts/THSarabunNew.ttf',
      'https://raw.githubusercontent.com/rawify/THSarabunNew/master/THSarabunNew.ttf'
    ];

    for (const url of fontUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue; 
        const blob = await response.blob();
        if (blob.type.includes('text/html')) continue;

        const base64data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              const result = reader.result;
              const base64 = result.includes(',') ? result.split(',')[1] : result;
              resolve(base64);
            } else {
              reject(new Error("Empty result"));
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        if (base64data) {
          doc.addFileToVFS('THSarabunNew.ttf', base64data);
          doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'normal');
          doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'bold');
          hideLoading();
          return true;
        }
      } catch (e) { console.warn(e); }
    }

    hideLoading();
    message.error("ไม่สามารถโหลดฟอนต์ภาษาไทยได้");
    return false;
  };

 // แก้ไขฟังก์ชัน fetchReport
const fetchReport = async () => {
  setLoading(true);
  setError(null);
  setCurrentPage(1);
  try {
    const [start, end] = dateRange;

    // 1️⃣ ดึงรายชื่อพนักงานทั้งหมดมาก่อน (Master List)
    // สมมติว่า collection ชื่อ "employees" (เช็คชื่อใน Firebase ของคุณด้วยนะครับ)
    const employeesSnap = await getDocs(collection(db, 'employees'));
    const allEmployees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2️⃣ ดึงข้อมูลการลงเวลา (Check-in Data)
    const q = query(
      collection(db, 'employee_checkin'),
      where('date', '>=', start.format('YYYY-MM-DD')),
      where('date', '<=', end.format('YYYY-MM-DD')),
      orderBy('date', 'asc')
    );
    const snapshot = await getDocs(q);
    const checkinData = snapshot.docs.map(doc => doc.data());

    const summary = {};

    // 3️⃣ สร้างโครงข้อมูลเริ่มต้นจากพนักงานทุกคน (แม้จะไม่มีการลงเวลาก็ตาม)
    allEmployees.forEach(emp => {
      // ตรวจสอบ key ให้ตรงกับใน Database (เช่น emp.employeeId หรือ emp.id)
      const empId = emp.employeeId || emp.id; 
      
      summary[empId] = {
        employeeId: empId,
        name: emp.name,
        branch: emp.branch || '-', // ใช้สาขาจาก Master เป็นหลัก
        lateCount: 0,
        leaveCount: 0,
        absentCount: 0,
        totalDeduction: 0,
        details: []
      };
    });

    // 4️⃣ วนลูปข้อมูล Check-in เพื่อคำนวณยอด
    checkinData.forEach(entry => {
      const { employeeId, date, checkinTime, status, branch } = entry;
      
      // ถ้าไม่มีใน Master (เช่น พนักงานเก่าที่ออกไปแล้ว) อาจจะข้าม หรือสร้างใหม่
      // ในที่นี้ถ้าไม่มี ให้สร้าง Object ใหม่กัน error
      if (!summary[employeeId]) {
         summary[employeeId] = {
            employeeId,
            name: entry.name, // ใช้ชื่อจาก Transaction
            branch: branch || '-',
            lateCount: 0, leaveCount: 0, absentCount: 0, totalDeduction: 0, details: []
         };
      }

      const emp = summary[employeeId];
      
      // ... (Logic การคำนวณเงินเหมือนเดิม) ...
      let fine = 0;
      let type = "";

      if (status === 'ขาดงาน' || checkinTime === '-' || !checkinTime) {
          fine = entry.fine ? Number(entry.fine) : 50;
          type = "ขาดงาน";
          emp.absentCount += 1;
      } 
      else {
          const checkin = dayjs(`${date} ${checkinTime}`, "YYYY-MM-DD HH:mm");
          const graceEnd = dayjs(`${date} 08:05`, "YYYY-MM-DD HH:mm");
          const late20End = dayjs(`${date} 08:15`, "YYYY-MM-DD HH:mm");
          const late50End = dayjs(`${date} 08:30`, "YYYY-MM-DD HH:mm");

          if (checkin.isValid()) {
              if (checkin.isAfter(graceEnd) && checkin.isSameOrBefore(late20End)) {
                  fine = 20;
                  type = "มาสาย (20 บาท)";
                  emp.lateCount += 1;
              } else if (checkin.isAfter(late20End) && checkin.isSameOrBefore(late50End)) {
                  fine = 50;
                  type = "มาสาย (50 บาท)";
                  emp.lateCount += 1;
              } else if (checkin.isAfter(late50End)) {
                  fine = 50;
                  type = "หยุด (50 บาท)";
                  emp.leaveCount += 1;
              }
          }
      }

      if (fine > 0) {
        emp.details.push({ date, checkinTime, branch: branch || emp.branch, fine, type });
      }

      emp.totalDeduction += fine;
    });

    setReportData(Object.values(summary));
  } catch (err) {
    console.error(err);
    setError('ไม่สามารถดึงข้อมูลได้จาก Firebase');
  } finally {
    setLoading(false);
  }
};

  const handleSearch = () => fetchReport();

  // ข้อมูลทั้งหมดที่ผ่านการกรอง
  const filteredData = reportData
    .filter(item =>
      item.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeId || '').toLowerCase().includes(searchText.toLowerCase())
    )
    .filter(item => (selectedBranch ? (item.branch || '') === selectedBranch : true));

  // Pagination Logic
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const showLateDetails = (record) => {
    setSelectedEmployee(record);
    setLateDetails(record.details || []);
    setModalVisible(true);
  };

  // 🔹 Update Excel Export (คืนค่าเงินเดือน + ปรับสูตรให้ตรงกับคอลัมน์ใหม่)
  const exportMainExcel = () => {
    if (!filteredData.length) return message.warning("ไม่มีข้อมูลสำหรับ Export");
    const ws_data = filteredData.map((d, index) => {
      const rowNum = index + 2; // แถวเริ่มที่ 2 (แถว 1 คือ Header)
      
      // ลำดับคอลัมน์:
      // A: รหัส
      // B: ชื่อ
      // C: สาขา
      // D: มาสาย
      // E: ขาดงาน
      // F: ลา
      // G: เงินเดือน (ใส่ค่าว่างเพื่อให้กรอกเองได้)
      // H: ยอดหักรวม
      // I: ยอดสุทธิ (สูตร G - H)

      return {
        'รหัสพนักงาน': d.employeeId, 
        'ชื่อ - สกุล': d.name, 
        'สาขา': d.branch, 
        'มาสาย (ครั้ง)': d.lateCount,
        'ขาดงาน (ครั้ง)': d.absentCount, 
        'ลา (วัน)': d.leaveCount, 
        'เงินเดือน (บาท)': null, // ✅ คืนค่าเงินเดือน (ว่างไว้)
        'ยอดหักรวม (บาท)': d.totalDeduction, 
        'ยอดสุทธิ (บาท)': { t: 'n', f: `G${rowNum}-H${rowNum}` } // ✅ คืนค่าสูตรคำนวณ (G - H)
      };
    });

    const ws = XLSX.utils.json_to_sheet(ws_data);
    
    // ตั้งค่าความกว้างคอลัมน์
    ws['!cols'] = [
        { wch: 15 }, // A
        { wch: 25 }, // B
        { wch: 20 }, // C
        { wch: 10 }, // D
        { wch: 10 }, // E
        { wch: 10 }, // F
        { wch: 20 }, // G (เงินเดือน)
        { wch: 20 }, // H (ยอดหัก)
        { wch: 20 }  // I (ยอดสุทธิ)
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    const [start, end] = dateRange;
    XLSX.writeFile(wb, `PayrollSummary_${start.format('YYYYMMDD')}-${end.format('YYYYMMDD')}.xlsx`);
  };

  // 🔹 Update PDF Export
  const exportMainPDF = async () => {
    if (!filteredData.length) return message.warning("ไม่มีข้อมูลสำหรับ Export");
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const fontLoaded = await ensureThaiFont(doc);
    if (!fontLoaded) return;
    doc.setFont('THSarabunNew'); doc.setFontSize(18);
    const [start, end] = dateRange;
    doc.text(`รายงานสรุปยอดหักเงิน (มาสาย / ขาด / ลา)`, 40, 50);
    doc.setFontSize(14); doc.text(`ช่วงวันที่: ${start.format('DD/MM/YYYY')} - ${end.format('DD/MM/YYYY')}`, 40, 75);
    if (selectedBranch) doc.text(`สาขา: ${selectedBranch}`, 40, 95);
    
    // เพิ่ม column ขาดงาน
    const tableRows = filteredData.map(d => [
        d.employeeId, d.name, d.branch, d.lateCount, d.absentCount, d.leaveCount, d.totalDeduction.toLocaleString()
    ]);
    
    autoTable(doc, {
      head: [['รหัส', 'ชื่อ - สกุล', 'สาขา', 'สาย(ครั้ง)', 'ขาด(ครั้ง)', 'ลา(วัน)', 'ยอดหัก(บาท)']], 
      body: tableRows, 
      startY: selectedBranch ? 110 : 90,
      theme: 'grid', styles: { font: 'THSarabunNew', fontSize: 12, cellPadding: 4 },
      headStyles: { fillColor: [230, 230, 230], textColor: [0,0,0], font: 'THSarabunNew', fontStyle: 'bold', fontSize: 12, halign: 'center' },
      bodyStyles: { font: 'THSarabunNew' }, columnStyles: { 6: { halign: 'right' } }
    });
    doc.save(`PayrollSummary_${start.format('YYYYMMDD')}-${end.format('YYYYMMDD')}.pdf`);
  };

  const columns = [
    { title: 'รหัสพนักงาน', dataIndex: 'employeeId', key: 'employeeId', width: 100 },
    {
      title: 'ชื่อ - สกุล', dataIndex: 'name', key: 'name', width: 180,
      render: (text, record) => (<Button type="link" onClick={() => showLateDetails(record)}>{text}</Button>)
    },
    { title: 'สาขา', dataIndex: 'branch', key: 'branch', align: 'center' },
    { title: 'มาสาย (ครั้ง)', dataIndex: 'lateCount', key: 'lateCount', align: 'center' },
    { 
        title: 'ขาดงาน (ครั้ง)', 
        dataIndex: 'absentCount', 
        key: 'absentCount', 
        align: 'center',
        render: (val) => val > 0 ? <span style={{color: 'red', fontWeight: 'bold'}}>{val}</span> : '-'
    },
    { title: 'ลา (วัน)', dataIndex: 'leaveCount', key: 'leaveCount', align: 'center' },
    { title: 'ยอดหักรวม (บาท)', dataIndex: 'totalDeduction', key: 'totalDeduction', align: 'right', render: v => v.toLocaleString() },
  ];

  const modalColumns = [
    { title: 'วันที่', dataIndex: 'date', key: 'date' },
    { title: 'เวลาเข้างาน', dataIndex: 'checkinTime', key: 'checkinTime' },
    { title: 'สาขา', dataIndex: 'branch', key: 'branch' },
    { 
        title: 'ประเภท', 
        dataIndex: 'type', 
        key: 'type',
        render: (text) => {
            let color = 'orange';
            if (text.includes('ขาดงาน')) color = 'red';
            return <Tag color={color}>{text}</Tag>
        }
    },
    { title: 'ค่าปรับ (บาท)', dataIndex: 'fine', key: 'fine', align: 'right' },
  ];

  const onPageChange = (page, size) => {
    setCurrentPage(page);
    setPageSize(size);
  };

  // Function Export Detail (Modal)
  const exportModalExcel = () => {
    if (!lateDetails.length) return message.warning("ไม่มีข้อมูลสำหรับ Export");
    const ws_data = lateDetails.map(d => ({
      'วันที่': d.date, 'เวลาเข้างาน': d.checkinTime, 'สาขา': d.branch, 'ประเภท': d.type, 'ค่าปรับ (บาท)': d.fine,
    }));
    const ws = XLSX.utils.json_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Details");
    XLSX.writeFile(wb, `PayrollDetail_${selectedEmployee.employeeId}.xlsx`);
  };

  const exportModalPDF = async () => {
    if (!lateDetails.length) return message.warning("ไม่มีข้อมูลสำหรับ Export");
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const fontLoaded = await ensureThaiFont(doc);
    if (!fontLoaded) return;
    doc.setFont('THSarabunNew'); doc.setFontSize(16);
    doc.text(`รายละเอียดการหักเงิน: ${selectedEmployee.name}`, 40, 40);
    const tableRows = lateDetails.map(d => [d.date,d.checkinTime,d.branch,d.type,d.fine]);
    autoTable(doc, {
      head: [['วันที่','เวลาเข้างาน','สาขา','ประเภท','ค่าปรับ (บาท)']], body: tableRows, startY: 60,
      theme: 'grid', styles: { font: 'THSarabunNew', fontSize: 12 },
      headStyles: { fillColor: [240,240,240], textColor: [0,0,0], fontStyle: 'bold', font: 'THSarabunNew' },
      bodyStyles: { font: 'THSarabunNew' }
    });
    doc.save(`PayrollDetail_${selectedEmployee.employeeId}.pdf`);
  };

  return (
    <div style={{ padding: 0 }}>

      <Card style={{ marginBottom: 20 }}>
        <Space style={{ marginBottom: 16 }} wrap>
          <span>เลือกช่วงวันที่: </span>
          <RangePicker value={dateRange} onChange={setDateRange} format="YYYY/MM/DD" />
          <Select
            placeholder="กรองตามสาขา"
            allowClear
            style={{ width: 240 }}
            onChange={(v) => { setSelectedBranch(v || ''); setCurrentPage(1); }}
            value={selectedBranch || undefined}
          >
            {branchOptions.map(b => (
              <Option key={b.id} value={b.name}>{b.name}</Option>
            ))}
          </Select>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>ดึงรายงาน</Button>
        </Space>
        <Search
          placeholder="ค้นหาพนักงาน (ชื่อ หรือ รหัส)"
          allowClear
          onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
          style={{ width: 300, marginLeft: 10 }}
        />
        {error && <Alert message="ข้อผิดพลาด" description={error} type="error" showIcon closable />}
      </Card>

      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={paginatedData}
          rowKey="employeeId"
          pagination={false} 
          bordered
        />
        
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <Pagination
            current={currentPage}
            total={filteredData.length}
            pageSize={pageSize}
            onChange={onPageChange}
            showSizeChanger
            showTotal={(total) => `ทั้งหมด ${total} รายการ`}
          />
          <Button icon={<FileExcelOutlined />} onClick={exportMainExcel} disabled={filteredData.length === 0} style={{ backgroundColor: '#1D6F42', color: 'white',marginLeft:'20px' }}>Export Excel</Button>
          <Button icon={<FilePdfOutlined />} onClick={exportMainPDF} disabled={filteredData.length === 0} style={{ backgroundColor: '#B30B00', color: 'white',marginLeft:'10px' }}>Export PDF</Button>
        </div>
        
      </Spin>

      <Modal
        title={`รายละเอียดการหักเงินของ ${selectedEmployee?.name || ''}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="excel" icon={<FileExcelOutlined />} onClick={exportModalExcel}>Export Excel</Button>,
          <Button key="pdf" icon={<FilePdfOutlined />} onClick={exportModalPDF}>Export PDF</Button>,
        ]}
        width={900}
      >
        <Table
          columns={modalColumns}
          dataSource={lateDetails}
          rowKey={(r) => `${r.date}-${r.checkinTime}`}
          pagination={false}
          bordered
        />
      </Modal>
    </div>
  );
};

export default PayrollReport;