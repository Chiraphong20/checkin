import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography, Card, DatePicker, Button, Space, Table, Spin, Alert, Input, Modal, Select, message, Pagination, Tag, Row, Col, Statistic
} from 'antd';
import {
  SearchOutlined, FileExcelOutlined, CalculatorOutlined, UserOutlined, DollarOutlined, ReloadOutlined
} from '@ant-design/icons';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isBetween from 'dayjs/plugin/isBetween';
import * as XLSX from 'xlsx';
import { db } from '../firebase'; 

dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// Helper: แปลงเวลา "HH:mm" เป็นนาที
const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

const PayrollReport = () => {
  // --- State ข้อมูล ---
  const [employees, setEmployees] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [branches, setBranches] = useState([]);
  const [globalSettings, setGlobalSettings] = useState({});

  // --- State สำหรับ UI ---
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [reportData, setReportData] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false); // Loading ตอนดึงข้อมูล
  const [calculating, setCalculating] = useState(false); // Loading ตอนคำนวณ
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [lateDetails, setLateDetails] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("ทั้งหมด");
  const [branchOptions, setBranchOptions] = useState([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 1. 🔹 โหลดข้อมูลทั้งหมด
  const fetchAllData = useCallback(async () => {
      setLoading(true);
      try {
          // A. โหลด Configs Global
          const settingsSnap = await getDoc(doc(db, "settings", "checkin"));
          if (settingsSnap.exists()) {
              setGlobalSettings(settingsSnap.data());
          }

          // B. โหลด Branches
          const branchSnap = await getDocs(collection(db, "branches"));
          const branchList = [];
          const bOptions = [];
          
          branchSnap.forEach((doc) => {
              const data = doc.data();
              branchList.push({ id: doc.id, ...data });
              if (data.name) bOptions.push(data.name);
          });
          
          setBranches(branchList);
          setBranchOptions([...new Set(bOptions)]);

          // C. โหลด Employees
          const empSnap = await getDocs(collection(db, "employees"));
          const empList = empSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setEmployees(empList);

          // D. โหลด Checkins ทั้งหมด
          const checkinSnap = await getDocs(collection(db, "employee_checkin"));
          const checkinList = checkinSnap.docs.map((doc) => doc.data());
          setCheckins(checkinList);

          // E. โหลด Leaves ทั้งหมด
          const leaveSnap = await getDocs(collection(db, "employee_leave"));
          const leaveList = leaveSnap.docs.map((doc) => doc.data());
          setLeaves(leaveList);

      } catch (err) {
          console.error("Error fetching data:", err);
          message.error("โหลดข้อมูลล้มเหลว");
      } finally {
          setLoading(false);
      }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // 2. 🔹 ฟังก์ชันคำนวณสถานะรายวัน
  const calculateDailyStatus = (employee, dateStr, checkinRecord, leaveRecord, branchConfigsMap) => {
      
      // 2.0 ถ้าเป็นผู้บริหาร (01) ไม่หักเงินทุกกรณี
      if (employee.department === '01') {
          return {
              status: 'ผู้บริหาร',
              fine: 0, 
              isLate: false, isAbsent: false, isLeave: false,
              checkinTime: checkinRecord ? checkinRecord.checkinTime : '-', 
              shift: '-'
          };
      }

      // 2.1 ถ้ามีใบลา (ที่อนุมัติแล้ว) -> ไม่หักเงิน
      if (leaveRecord) {
          return {
              status: leaveRecord.type,
              fine: 0, 
              isLate: false, isAbsent: false, isLeave: true,
              checkinTime: '-', shift: '-'
          };
      }

      // 2.2 ถ้าไม่มี Checkin -> ขาดงาน
      if (!checkinRecord) {
          const fine = globalSettings.absentFine || 50;
          return {
              status: 'ขาดงาน',
              fine: fine,
              isLate: false, isAbsent: true, isLeave: false,
              checkinTime: '-', shift: '-'
          };
      }

      // ✅ 2.3 มี Checkin -> ใช้ค่าจาก DB ก่อนเลยเพื่อความแม่นยำ
      // ถ้าในฐานข้อมูลมีค่าปรับ หรือ สถานะที่บันทึกไว้แล้ว ให้ใช้ค่านั้น (เพราะคำนวณมาแล้วตอนสแกน)
      if (checkinRecord.fine !== undefined && checkinRecord.status) {
         // เช็คเพิ่มว่าถ้า status เป็น "มาปกติ" แต่ fine > 0 (เผื่อข้อมูลเพี้ยน) ให้เชื่อ status
         let finalFine = checkinRecord.fine;
         if (checkinRecord.status === "มาปกติ") finalFine = 0;
         
         const isLate = checkinRecord.status.includes("สาย");

         return {
             status: checkinRecord.status,
             fine: finalFine,
             isLate: isLate,
             isAbsent: false,
             isLeave: false,
             checkinTime: checkinRecord.checkinTime,
             shift: checkinRecord.shift || 1
         };
      }

      // --- กรณีข้อมูลเก่า หรือต้องการคำนวณใหม่ (Backup Logic) ---
      const branchName = checkinRecord.branch;
      const config = branchConfigsMap[branchName] || {}; 
      const shift = checkinRecord.shift || 1; 

      let startTimeStr, lateAfterStr, t1Str, t2Str;

      // ✅ แยก Config กะ 1 และ กะ 2 อย่างเด็ดขาด (ห้าม Fallback ข้ามกะ)
      if (shift === 2) {
           startTimeStr = config.shift2_startTime || "13:00";
           lateAfterStr = config.shift2_lateAfter || "13:05";
           t1Str = config.shift2_lateThreshold1 || "13:15";
           t2Str = config.shift2_lateThreshold2 || "13:30";
      } else {
           // กะ 1 หรือ Default
           startTimeStr = config.shift1_startTime || config.startTime || "08:00";
           lateAfterStr = config.shift1_lateAfter || config.lateAfter || "08:05";
           t1Str = config.shift1_lateThreshold1 || config.lateThreshold1 || "08:15";
           t2Str = config.shift1_lateThreshold2 || config.lateThreshold2 || "08:30";
      }

      const checkinMins = timeToMinutes(checkinRecord.checkinTime);
      const lateAfterMins = timeToMinutes(lateAfterStr);
      const t1Mins = timeToMinutes(t1Str);
      const t2Mins = timeToMinutes(t2Str);

      let status = 'ปกติ';
      let fine = 0;
      let isLate = false;

      const { lateFine20, lateFine50, absentFine } = globalSettings;

      if (checkinMins > lateAfterMins) {
          isLate = true;
          if (checkinMins <= t1Mins) {
              status = `สาย (ระดับ 1)`;
              fine = lateFine20 || 20; 
          } else if (checkinMins <= t2Mins) {
              status = 'สาย (ระดับ 2)';
              fine = lateFine50 || 50;
          } else {
              status = 'สายมาก/ขาด';
              fine = absentFine || 50;
          }
      }

      return {
          status, fine, isLate, isAbsent: false, isLeave: false,
          checkinTime: checkinRecord.checkinTime, shift: shift
      };
  };

  // 3. 🔹 ฟังก์ชันสร้างรายงาน
  const handleCalculateReport = () => {
    if (!dateRange || dateRange.length !== 2) {
      message.warning('กรุณาเลือกช่วงวันที่');
      return;
    }

    setCalculating(true);

    const branchMap = {};
    branches.forEach(b => branchMap[b.name] = b);

    const [start, end] = dateRange;
    const startDateStr = start.format('YYYY-MM-DD');
    const endDateStr = end.format('YYYY-MM-DD');

    const filteredCheckins = checkins.filter(c => c.date >= startDateStr && c.date <= endDateStr);
    
    const filteredLeaves = leaves.filter(l => {
        const lStart = dayjs(l.start || l.date);
        const lEnd = dayjs(l.end || l.date);
        return (lStart.isBefore(end) || lStart.isSame(end)) && 
               (lEnd.isAfter(start) || lEnd.isSame(start)) &&
               l.status === 'Approved';
    });

    const report = employees.map(emp => {
        let totalLateFine = 0;
        let totalAbsentFine = 0;
        let workDays = 0;
        let lateDays = 0;
        let absentDays = 0;
        let leaveDays = 0;
        
        const details = [];
        let curr = dayjs(start);
        const last = dayjs(end);

        while (curr.isSameOrBefore(last)) {
            const dateStr = curr.format('YYYY-MM-DD');
            
            const checkinRec = filteredCheckins.find(c => c.employeeId === emp.employeeId && c.date === dateStr);
            
            const leaveRec = filteredLeaves.find(l => {
                const lStart = dayjs(l.start || l.date);
                const lEnd = dayjs(l.end || l.date);
                return l.employeeId === emp.employeeId && curr.isBetween(lStart, lEnd, 'day', '[]');
            });

            // ✅ คำนวณสถานะรายวัน
            const dailyResult = calculateDailyStatus(emp, dateStr, checkinRec, leaveRec, branchMap);

            if (dailyResult.isLeave) {
                leaveDays++;
            } else if (dailyResult.isAbsent) {
                absentDays++;
                totalAbsentFine += dailyResult.fine;
            } else {
                workDays++;
                if (dailyResult.isLate) {
                    lateDays++;
                    totalLateFine += dailyResult.fine;
                }
            }

            if (dailyResult.isLate || dailyResult.isAbsent || dailyResult.fine > 0) {
                details.push({
                    date: dateStr,
                    ...dailyResult,
                    branch: checkinRec ? checkinRec.branch : emp.branch
                });
            }

            curr = curr.add(1, 'day');
        }

        return {
            ...emp,
            totalLateFine,
            totalAbsentFine,
            totalDeduction: totalLateFine + totalAbsentFine,
            workDays, lateDays, absentDays, leaveDays, details
        };
    });

    setReportData(report);
    setCalculating(false);
    message.success("คำนวณยอดเสร็จสิ้น");
  };

  // Filter & Pagination
  const filteredData = reportData.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchText.toLowerCase()) || 
                          (item.employeeId && item.employeeId.toString().includes(searchText));
    const matchesBranch = selectedBranch === "ทั้งหมด" || item.branch === selectedBranch;
    return matchesSearch && matchesBranch;
  });
  
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const onPageChange = (page, size) => {
      setCurrentPage(page);
      setPageSize(size);
  };

  const handleViewDetails = (record) => {
    setSelectedEmployee(record);
    setLateDetails(record.details || []);
    setModalVisible(true);
  };

  const exportMainExcel = () => {
    const dataToExport = filteredData.map(item => ({
      'รหัสพนักงาน': item.employeeId,
      'ชื่อ-สกุล': item.name,
      'สาขา': item.branch,
      'มาทำงาน (วัน)': item.workDays,
      'มาสาย (ครั้ง)': item.lateDays,
      'ขาดงาน (วัน)': item.absentDays,
      'ลา (วัน)': item.leaveDays,
      'หักมาสาย (บาท)': item.totalLateFine,
      'หักขาดงาน (บาท)': item.totalAbsentFine,
      'รวมหัก (บาท)': item.totalDeduction
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll_Report");
    XLSX.writeFile(wb, `Payroll_Report_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  const modalColumns = [
    { title: 'วันที่', dataIndex: 'date', key: 'date' },
    { title: 'สาขา', dataIndex: 'branch', key: 'branch' },
    { title: 'กะ', dataIndex: 'shift', key: 'shift', render: (s) => s && s !== '-' ? `กะ ${s}` : '-' },
    { title: 'เวลาเข้า', dataIndex: 'checkinTime', key: 'checkinTime' },
    { title: 'สถานะ', dataIndex: 'status', key: 'status', render: (t) => <Tag color={t.includes('ขาด') ? 'red' : (t.includes('สาย') ? 'orange' : 'blue')}>{t}</Tag> },
    { title: 'หักเงิน', dataIndex: 'fine', key: 'fine', render: (val) => <Text type="danger">{val} ฿</Text> }
  ];

  const columns = [
    { title: 'รหัส', dataIndex: 'employeeId', key: 'employeeId', width: 80, align: 'center' },
    { title: 'ชื่อ-สกุล', dataIndex: 'name', key: 'name' },
    { title: 'สาขา', dataIndex: 'branch', key: 'branch', width: 120 },
    { 
        title: 'สถิติการมา', 
        align: 'center',
        render: (_, r) => (
            <Space direction="vertical" size={0}>
                <Text style={{fontSize: 12}}>ทำงาน: {r.workDays}</Text>
                <Text style={{fontSize: 12, color: 'orange'}}>สาย: {r.lateDays}</Text>
                <Text style={{fontSize: 12, color: 'red'}}>ขาด: {r.absentDays}</Text>
                <Text style={{fontSize: 12, color: 'blue'}}>ลา: {r.leaveDays}</Text>
            </Space>
        )
    },
    { 
        title: 'หักมาสาย', 
        dataIndex: 'totalLateFine', 
        key: 'totalLateFine', 
        align: 'right',
        render: (val) => val > 0 ? <Text type="warning">{val.toLocaleString()} ฿</Text> : '-' 
    },
    { 
        title: 'หักขาดงาน', 
        dataIndex: 'totalAbsentFine', 
        key: 'totalAbsentFine', 
        align: 'right',
        render: (val) => val > 0 ? <Text type="danger">{val.toLocaleString()} ฿</Text> : '-' 
    },
    { 
        title: 'รวมหัก', 
        dataIndex: 'totalDeduction', 
        key: 'totalDeduction', 
        align: 'right',
        render: (val) => <Text strong type="danger">{val.toLocaleString()} ฿</Text> 
    },
    {
      title: 'รายละเอียด',
      key: 'action',
      align: 'center',
      render: (_, record) => (
        <Button size="small" onClick={() => handleViewDetails(record)} icon={<SearchOutlined />}>
          ดู
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Title level={2}>💰 รายงานสรุปการหักเงินเดือน</Title>

      <Card style={{ marginBottom: 20 }}>
        <Space wrap>
          <RangePicker 
            value={dateRange} 
            onChange={setDateRange} 
            style={{ width: 250 }} 
          />
          <Select 
            value={selectedBranch} 
            onChange={setSelectedBranch} 
            style={{ width: 200 }}
            placeholder="เลือกสาขา"
          >
              <Option value="ทั้งหมด">ทุกสาขา</Option>
              {branchOptions.map(b => <Option key={b} value={b}>{b}</Option>)}
          </Select>
          <Input 
            placeholder="ค้นหาชื่อพนักงาน..." 
            prefix={<SearchOutlined />} 
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 200 }}
          />
          <Button 
            type="primary" 
            onClick={handleCalculateReport} 
            icon={<CalculatorOutlined />} 
            loading={calculating}
            disabled={loading} 
          >
            คำนวณยอด
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchAllData} loading={loading}>โหลดข้อมูลใหม่</Button>
        </Space>
      </Card>

      {/* แจ้งเตือนสถานะการโหลดข้อมูล */}
      {loading && (
          <Alert message="กำลังโหลดข้อมูลทั้งหมด... กรุณารอสักครู่" type="info" showIcon style={{ marginBottom: 20 }} />
      )}

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="ยอดหักรวมทั้งหมด"
              value={filteredData.reduce((sum, item) => sum + item.totalDeduction, 0)}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="บาท"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
            <Card>
                <Statistic
                title="จำนวนพนักงานที่ถูกหัก"
                value={filteredData.filter(i => i.totalDeduction > 0).length}
                prefix={<UserOutlined />}
                suffix="คน"
                />
            </Card>
        </Col>
      </Row>

      <Spin spinning={calculating || loading}>
        <Table
          columns={columns}
          dataSource={paginatedData}
          rowKey="id"
          pagination={false}
          bordered
          summary={pageData => {
            let totalLate = 0;
            let totalAbsent = 0;
            let totalAll = 0;
            pageData.forEach(({ totalLateFine, totalAbsentFine, totalDeduction }) => {
              totalLate += totalLateFine;
              totalAbsent += totalAbsentFine;
              totalAll += totalDeduction;
            });
            return (
              <>
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 'bold' }}>
                  <Table.Summary.Cell index={0} colSpan={4} align="right">รวมหน้านี้</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">{totalLate.toLocaleString()}</Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">{totalAbsent.toLocaleString()}</Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">{totalAll.toLocaleString()}</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} />
                </Table.Summary.Row>
              </>
            );
          }}
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
        </div>
        
      </Spin>

      <Modal
        title={`รายละเอียดการหักเงินของ ${selectedEmployee?.name || ''}`}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setModalVisible(false)}>ปิด</Button>
        ]}
        width={800}
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