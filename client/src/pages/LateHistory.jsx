import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { Table, Typography, Spin, Card, Button } from "antd";

const { Title, Text } = Typography;

const LateHistory = () => {
  const { employeeId } = useParams();
  const [lateRecords, setLateRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLateRecords = async () => {
      try {
        const q = query(
          collection(db, "checkins"),
          where("employeeId", "==", employeeId),
          orderBy("date", "desc")
        );
        const querySnapshot = await getDocs(q);

        const records = querySnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter(
            (d) =>
              d.status?.includes("สาย") ||
              d.status?.includes("หัก") ||
              (d.fine && d.fine > 0)
          );

        setLateRecords(records);
      } catch (error) {
        console.error("Error fetching late records:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLateRecords();
  }, [employeeId]);

  const totalFine = lateRecords.reduce((sum, rec) => sum + (rec.fine || 0), 0);

  const columns = [
    { title: "วันที่", dataIndex: "date", key: "date" },
    { title: "เวลาเข้างาน", dataIndex: "checkinTime", key: "checkinTime" },
    { title: "สาขา", dataIndex: "branch", key: "branch" },
    { title: "สถานะ", dataIndex: "status", key: "status" },
    { title: "ค่าปรับ (บาท)", dataIndex: "fine", key: "fine" },
  ];

  return (
    <Card style={{ margin: 20 }}>
      <Button onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        ← กลับ
      </Button>
      <Title level={3}>ประวัติการมาสาย</Title>
      <Text>รหัสพนักงาน: {employeeId}</Text>
      <br />
      <Text type="danger">
        💰 ค่าปรับสะสมทั้งหมด: {totalFine.toLocaleString()} บาท
      </Text>
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <Spin size="large" />
        ) : (
          <Table
            columns={columns}
            dataSource={lateRecords}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        )}
      </div>
    </Card>
  );
};

export default LateHistory;
