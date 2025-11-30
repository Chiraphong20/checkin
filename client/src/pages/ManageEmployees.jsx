import React, { useState, useEffect } from 'react';
import {
  Typography, Card, Button, Table, Spin, message, Modal,
  Form, Input, Select, Space, DatePicker, Popconfirm,
} from 'antd';
import {
  UserAddOutlined, EditOutlined, DeleteOutlined,
  SearchOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  collection, getDocs, setDoc, updateDoc, deleteDoc, doc
} from "firebase/firestore";
import { db } from "../firebase";

const { Title } = Typography;
const { Option } = Select;
const { Search } = Input;

// รายการแผนก
const departments = [
  { code: '01', name: 'แผนกผู้บริหาร / กรรมการ' },
  { code: '02', name: 'Office' },
  { code: '03', name: 'พนักงานขาย' },
  { code: '04', name: 'พนักงานขนส่ง' },
];

const ManageEmployees = () => {
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [branchOptions, setBranchOptions] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');

  // ดึงข้อมูลสาขา
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const snapshot = await getDocs(collection(db, "branches"));
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        setBranchOptions(data);
      } catch (error) {
        console.error("ไม่สามารถดึงข้อมูลสาขาได้", error);
      }
    };
    fetchBranches();
  }, []);

  // ดึงข้อมูลพนักงาน
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "employees"));
      const data = querySnapshot.docs.map((doc) => {
        const emp = doc.data();
        return {
          id: doc.id,
          employeeId: emp.employeeId || doc.id,
          ...emp,
        };
      });
      setEmployees(data);
      setFilteredEmployees(data);
    } catch (error) {
      console.error(error);
      message.error("ไม่สามารถดึงข้อมูลพนักงานได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  // กรองข้อมูล
  const handleFilter = (searchValue, deptValue, branchValue) => {
    let filtered = employees;
    if (searchValue) {
      const text = searchValue.toLowerCase();
      filtered = filtered.filter(emp =>
        emp.name?.toLowerCase().includes(text) ||
        emp.employeeId?.toLowerCase().includes(text)
      );
    }
    if (deptValue) filtered = filtered.filter(emp => emp.department === deptValue);
    if (branchValue) {
      filtered = filtered.filter(emp => {
        const branches = Array.isArray(emp.branches) 
          ? emp.branches 
          : (emp.branch ? [emp.branch] : []);
        return branches.includes(branchValue);
      });
    }
    setFilteredEmployees(filtered);
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchText(value);
    handleFilter(value, selectedDepartment, selectedBranch);
  };

  const handleDepartmentFilter = (value) => {
    setSelectedDepartment(value);
    handleFilter(searchText, value, selectedBranch);
  };

  const handleBranchFilter = (value) => {
    setSelectedBranch(value);
    handleFilter(searchText, selectedDepartment, value);
  };

  // สร้างรหัสพนักงาน
  const generateEmployeeId = async (departmentCode, joinDate) => {
    const year = joinDate ? (joinDate.year() + 543) % 100 : (dayjs().year() + 543) % 100;
    const prefix = `${year}-${departmentCode}-`;
    try {
      const snapshot = await getDocs(collection(db, "employees"));
      const sameDeptThisYear = snapshot.docs
        .map(doc => doc.data())
        .filter(emp => emp.employeeId?.startsWith(prefix));

      let lastNumber = 0;
      sameDeptThisYear.forEach(emp => {
        const parts = emp.employeeId.split("-");
        const num = parseInt(parts[2]);
        if (num > lastNumber) lastNumber = num;
      });

      const nextNumber = String(lastNumber + 1).padStart(3, "0");
      return `${prefix}${nextNumber}`;
    } catch (error) {
      console.error(error);
      return `${prefix}001`;
    }
  };

  // เพิ่มพนักงานใหม่
  const handleAddClick = () => {
    setEditingEmployee(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  // แก้ไขพนักงาน
  const handleEditEmployee = (record) => {
    setEditingEmployee(record);
    const branches = Array.isArray(record.branches) 
      ? record.branches 
      : (record.branch ? [record.branch] : []);
    form.setFieldsValue({
      ...record,
      branches: branches,
      joinDate: record.joinDate ? dayjs(record.joinDate) : null,
    });
    setIsModalOpen(true);
  };

  // ลบพนักงาน
  const handleDeleteEmployee = async (record) => {
    try {
      await deleteDoc(doc(db, "employees", record.id)).catch(() => null);
      await deleteDoc(doc(db, "employees", record.employeeId)).catch(() => null);
      setEmployees(prev => prev.filter(emp => emp.id !== record.id));
      setFilteredEmployees(prev => prev.filter(emp => emp.id !== record.id));
      message.success(`ลบพนักงาน ${record.name} สำเร็จ`);
    } catch (error) {
      console.error(error);
      message.error("เกิดข้อผิดพลาดในการลบพนักงาน");
    }
  };

  // เมื่อเลือกแผนกในฟอร์ม
  const handleDepartmentChange = async (value) => {
    form.setFieldsValue({ department: value });
    if (!editingEmployee) {
      const joinDate = form.getFieldValue("joinDate");
      const newId = await generateEmployeeId(value, joinDate);
      form.setFieldsValue({ employeeId: newId });
    }
  };

  // เมื่อเลือกวันที่เข้าทำงาน
  const handleJoinDateChange = async (date) => {
    form.setFieldsValue({ joinDate: date });
    if (!editingEmployee) {
      const department = form.getFieldValue("department");
      if (department) {
        const newId = await generateEmployeeId(department, date);
        form.setFieldsValue({ employeeId: newId });
      }
    }
  };

  // บันทึกฟอร์ม
  const handleFormSubmit = async (values) => {
    try {
      // -----------------------------------------------------------
      // 1. ตรวจสอบชื่อซ้ำ (Logic ใหม่)
      // -----------------------------------------------------------
      const inputName = values.name.trim(); // ตัดช่องว่างหน้าหลัง
      
      const isDuplicate = employees.some(emp => {
        // ถ้าเป็นการแก้ไข ให้ข้ามรายการของตัวเองไป (เช็คแค่คนอื่น)
        if (editingEmployee && emp.id === editingEmployee.id) {
          return false;
        }
        // ตรวจสอบชื่อว่าตรงกันไหม (เปรียบเทียบแบบ string ปกติ)
        return emp.name.trim() === inputName;
      });

      if (isDuplicate) {
        message.error(`ชื่อ "${inputName}" มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`);
        return; // หยุดการทำงานทันที ไม่บันทึก
      }
      // -----------------------------------------------------------


      const branches = Array.isArray(values.branches) && values.branches.length > 0
        ? values.branches
        : (values.branch ? [values.branch] : []);
      
      const data = {
        ...values,
        name: inputName, // ใช้ชื่อที่ตัดช่องว่างแล้ว
        branches: branches,
        branch: branches[0] || '',
        joinDate: values.joinDate?.format("YYYY-MM-DD"),
      };

      if (editingEmployee) {
        await updateDoc(doc(db, "employees", editingEmployee.id), data);
        message.success(`อัปเดตข้อมูลพนักงาน ${editingEmployee.name} สำเร็จ`);
      } else {
        const employeeId = values.employeeId;
        await setDoc(doc(db, "employees", employeeId), data);
        message.success(`เพิ่มพนักงานใหม่ รหัส ${employeeId} สำเร็จ!`);
      }

      setIsModalOpen(false);
      fetchEmployees();
      form.resetFields();
    } catch (error) {
      console.error(error);
      message.error("ไม่สามารถบันทึกข้อมูลได้");
    }
  };

  // Columns ตาราง
  const columns = [
    { title: 'รหัสพนักงาน', dataIndex: 'employeeId', key: 'employeeId' },
    { title: 'ชื่อ - สกุล', dataIndex: 'name', key: 'name' },
    {
      title: 'แผนก',
      dataIndex: 'department',
      key: 'department',
      render: (code) => departments.find(d => d.code === code)?.name || code
    },
    { 
      title: 'สาขา', 
      dataIndex: 'branches', 
      key: 'branches',
      render: (branches, record) => {
        const branchList = Array.isArray(branches) 
          ? branches 
          : (record.branch ? [record.branch] : []);
        return branchList.length > 0 ? branchList.join(', ') : '-';
      }
    },
    {
      title: 'วันที่เข้าทำงาน',
      dataIndex: 'joinDate',
      key: 'joinDate',
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : '-'
    },
   {
      title: 'ดำเนินการ',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEditEmployee(record)}>แก้ไข</Button>
          <Popconfirm
            title="คุณแน่ใจหรือไม่ที่จะลบพนักงานนี้?"
            okText="ยืนยัน"
            cancelText="ยกเลิก"
            onConfirm={() => handleDeleteEmployee(record)}
          >
            <Button danger icon={<DeleteOutlined />}>ลบ</Button>
          </Popconfirm>
        </Space>
      ),
    }
  ];

  return (
    <div>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Search
            placeholder="ค้นหาชื่อหรือรหัสพนักงาน"
            allowClear
            onChange={handleSearchChange}
            style={{ width: 250 }}
          />
          <Select
            placeholder="กรองตามแผนก"
            allowClear
            onChange={handleDepartmentFilter}
            style={{ width: 220 }}
          >
            {departments.map(d => (
              <Option key={d.code} value={d.code}>{d.name}</Option>
            ))}
          </Select>
          <Select
            placeholder="กรองตามสาขา"
            allowClear
            onChange={handleBranchFilter}
            style={{ width: 220 }}
            value={selectedBranch || undefined}
          >
            {branchOptions.map(branch => (
              <Option key={branch.id} value={branch.name}>{branch.name}</Option>
            ))}
          </Select>
          <Button type="primary" icon={<UserAddOutlined />} onClick={handleAddClick}>
            เพิ่มพนักงานใหม่
          </Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
       <Table
  columns={columns}
  dataSource={filteredEmployees}
  rowKey="id"
  bordered
  pagination={{
    pageSize: 25,
    showSizeChanger: true,
    pageSizeOptions: ["10", "20", "50", "100"],
    showQuickJumper: true,
    position: ["bottomCenter"],
  }}
/>

      </Spin>

      <Modal
        title={editingEmployee ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงานใหม่"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleFormSubmit}>
          <Form.Item name="employeeId" label="รหัสพนักงาน">
            <Input readOnly placeholder="รหัสจะถูกสร้างอัตโนมัติ" />
          </Form.Item>

          <Form.Item
            name="name"
            label="ชื่อ - สกุล"
            rules={[{ required: true, message: "กรุณากรอกชื่อ - สกุล" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="department"
            label="แผนก"
            rules={[{ required: true, message: "กรุณาเลือกแผนก" }]}
          >
            <Select placeholder="เลือกแผนก" onChange={handleDepartmentChange}>
              {departments.map(d => <Option key={d.code} value={d.code}>{d.name}</Option>)}
            </Select>
          </Form.Item>

          {/* -----------------------------------------------------------
            2. ปรับปรุง Input เบอร์โทร
            -----------------------------------------------------------
          */}
          <Form.Item
            name="phone"
            label="เบอร์โทร"
            rules={[
              { required: true, message: "กรุณากรอกเบอร์โทร" },
              { pattern: /^[0-9]{10}$/, message: "เบอร์โทรต้องเป็นตัวเลข 10 หลักเท่านั้น" }
            ]}
          >
            <Input maxLength={10} placeholder="0XXXXXXXXX" />
          </Form.Item>
          {/* ----------------------------------------------------------- */}

          <Form.Item
            name="branches"
            label="สาขา"
            rules={[{ required: true, message: "กรุณาเลือกสาขาอย่างน้อย 1 สาขา" }]}
          >
            <Select 
              mode="multiple"
              placeholder="เลือกสาขา (สามารถเลือกได้หลายสาขา)"
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {branchOptions.map(branch => (
                <Option key={branch.id} value={branch.name} label={branch.name}>
                  {branch.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="joinDate"
            label="วันที่เข้าทำงาน"
            rules={[{ required: true, message: "กรุณาเลือกวันที่เข้าทำงาน" }]}
          >
            <DatePicker 
              style={{ width: "100%" }} 
              format="DD/MM/YYYY" 
              onChange={handleJoinDateChange}
            />
          </Form.Item>

          <Form.Item style={{ textAlign: "right" }}>
            <Button onClick={() => setIsModalOpen(false)} style={{ marginRight: 8 }}>
              ยกเลิก
            </Button>
            <Button type="primary" htmlType="submit">
              {editingEmployee ? "บันทึกการแก้ไข" : "บันทึก"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageEmployees;