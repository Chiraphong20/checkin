import React, { useEffect, useState, useRef } from "react";
import {
  Typography,
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Space,
  Popconfirm,
  message,
  
} from "antd";
import { Pagination } from 'antd';

import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  QrcodeOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import QRCode from "react-qr-code";
import { toPng } from "html-to-image";
import download from "downloadjs";

const { Title } = Typography;

const ManageBranches = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [previewBranch, setPreviewBranch] = useState(null);
  const [form] = Form.useForm();
  const qrRef = useRef();
const [currentPage, setCurrentPage] = useState(1);
const pageSize = 3; // จำนวนต่อหน้า
const paginatedData = branches.slice(
  (currentPage - 1) * pageSize,
  currentPage * pageSize
);

  const branchesRef = collection(db, "branches");

  // โหลดข้อมูลสาขา
  const fetchBranches = async () => {
    setLoading(true);
    const data = await getDocs(branchesRef);
    setBranches(data.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
    setLoading(false);
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  const openModal = (branch = null) => {
    setEditingBranch(branch);
    form.setFieldsValue(branch || { name: "", address: "", gps: "" });
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();

      // ตรวจสอบว่ากรอก GPS หรือไม่
      if (!values.gps || !values.gps.trim()) {
        message.error("กรุณากรอก Latitude,Longitude ของสาขา");
        return;
      }

      // ตรวจสอบรูปแบบ Lat,Lng
      const gpsParts = values.gps.split(",").map((v) => parseFloat(v.trim()));
      if (
        gpsParts.length !== 2 ||
        gpsParts.some((v) => isNaN(v))
      ) {
        message.error("รูปแบบพิกัดไม่ถูกต้อง กรุณากรอกในรูปแบบ Lat,Lng");
        return;
      }

      if (editingBranch) {
        await updateDoc(doc(db, "branches", editingBranch.id), values);
        message.success("อัปเดตสาขาสำเร็จ");
      } else {
        await addDoc(branchesRef, values);
        message.success("เพิ่มสาขาใหม่สำเร็จ");
      }

      form.resetFields();
      setIsModalVisible(false);
      setEditingBranch(null);
      fetchBranches();
    } catch (error) {
      console.error(error);
      message.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, "branches", id));
    message.success("ลบสาขาสำเร็จ");
    fetchBranches();
  };

  const handlePreview = (branch) => {
    setPreviewBranch(branch);
  };

  const handleDownloadQR = async () => {
    if (!qrRef.current) return;
    try {
      const dataUrl = await toPng(qrRef.current);
      download(dataUrl, `${previewBranch.name}-QR.png`);
    } catch (err) {
      console.error("ดาวน์โหลดไม่สำเร็จ", err);
    }
  };

  const columns = [
    { title: "ชื่อสาขา", dataIndex: "name", key: "name" },
    { title: "ที่อยู่", dataIndex: "address", key: "address" },
    { title: "พิกัด GPS", dataIndex: "gps", key: "gps" },
    {
      title: "QR Code",
      key: "qr",
      render: (_, record) => (
        <QRCode
          value={`https://d880ade62786.ngrok-free.app/checkin?branch=${encodeURIComponent(
            record.name
          )}`}
          size={64}
        />
      ),
    },
    {
      title: "การจัดการ",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button
            icon={<QrcodeOutlined />}
            onClick={() => handlePreview(record)}
          >
            ดู QR
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
          >
            แก้ไข
          </Button>
          <Popconfirm
            title="คุณแน่ใจว่าจะลบสาขานี้?"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button danger icon={<DeleteOutlined />}>
              ลบ
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openModal()}
          style={{ marginBottom: 16 }}
        >
          + เพิ่มสาขาใหม่
        </Button>
        
        {/* ส่วนที่แก้ไข: เพิ่ม pagination={{ pageSize: 4 }} 
            เพื่อให้แสดงหน้าละ 4 รายการ 
        */}
<Table
  columns={columns}
  dataSource={branches}
  rowKey="id"
  loading={loading}
  bordered
  pagination={{
    pageSize: 3
    ,                 // จำนวนข้อมูลต่อหน้า
    showSizeChanger: true,        // 10 / 20 / 50 / 100
    pageSizeOptions: ["10", "20", "50", "100"],
    showQuickJumper: true,        // ข้ามไปหน้าที่ต้องการ
    position: ["bottomCenter"],   // จุดที่แสดง Pagination
  }}
/>



        
      </Card>

      {/* Modal เพิ่ม/แก้ไข */}
      <Modal
        title={editingBranch ? "แก้ไขสาขา" : "เพิ่มสาขาใหม่"}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="ชื่อสาขา"
            rules={[{ required: true, message: "กรุณากรอกชื่อสาขา" }]}
          >
            <Input placeholder="เช่น Fukuro เทิดไท" />
          </Form.Item>

          <Form.Item
            name="address"
            label="ที่อยู่"
            rules={[{ required: true, message: "กรุณากรอกที่อยู่สาขา" }]}
          >
            <Input placeholder="เช่น 123 ถ.มิตรภาพ อ.เมือง จ.นครราชสีมา" />
          </Form.Item>

          <Form.Item
            name="gps"
            label="พิกัด GPS (Latitude,Longitude)"
            rules={[{ required: true, message: "กรุณากรอกพิกัดสาขา" }]}
            help="กรอก Latitude และ Longitude คั่นด้วยเครื่องหมายคอมม่า เช่น 14.9709,102.0977"
          >
            <Input placeholder="14.9709,102.0977" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Preview QR */}
      <Modal
        open={!!previewBranch}
        title={`QR Code สาขา: ${previewBranch?.name || ""}`}
        onCancel={() => setPreviewBranch(null)}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={handleDownloadQR}>
            ดาวน์โหลด
          </Button>,
          <Button key="close" onClick={() => setPreviewBranch(null)}>
            ปิด
          </Button>,
        ]}
      >
        {previewBranch && (
          <div style={{ textAlign: "center" }}>
            <div ref={qrRef} style={{ display: "inline-block", padding: 16 }}>
              <QRCode
                value={`https://d880ade62786.ngrok-free.app/checkin?branch=${encodeURIComponent(
                  previewBranch.name
                )}`}
                size={200}
              />
            </div>
            <p style={{ marginTop: 10 }}>{previewBranch.name}</p>
            <p>{previewBranch.address}</p>
            <p>{previewBranch.gps}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ManageBranches;