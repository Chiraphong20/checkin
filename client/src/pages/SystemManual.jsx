import React from 'react';
import { Card, Collapse, Typography, Divider, Tag, Space, Alert } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  InfoCircleOutlined,
  CalendarOutlined
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;
const { Panel } = Collapse;

const SystemManual = () => {
  const iconStyle = { fontSize: '20px', marginRight: '8px' };

  return (
    <div style={{ padding: '0', background: '#f5f5f5', minHeight: '100%' }}>
      <Card
        bordered={false}
        style={{
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <FileTextOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
          <Title level={2} style={{ margin: 0 }}>คู่มือการใช้งานระบบ</Title>
          <Text type="secondary" style={{ fontSize: '16px' }}>
            ระบบเช็คอินพนักงาน - วงษ์หิรัญ
          </Text>
        </div>

        <Alert
          message="ยินดีต้อนรับสู่คู่มือการใช้งานระบบ"
          description="คู่มือนี้จะช่วยให้คุณเข้าใจและใช้งานระบบได้อย่างมีประสิทธิภาพ"
          type="info"
          showIcon
          style={{ marginBottom: '24px' }}
        />
      </Card>

      <Collapse
        defaultActiveKey={['1']}
        size="large"
        style={{ marginBottom: '24px' }}
      >
        <Panel
          header={
            <Space>
              <DashboardOutlined style={iconStyle} />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>ภาพรวมระบบ (Dashboard)</span>
            </Space>
          }
          key="1"
        >
          <Card type="inner" style={{ marginBottom: '16px' }}>
            <Title level={4}>📊 ภาพรวม Dashboard</Title>
            <Paragraph>
              หน้า Dashboard แสดงข้อมูลสรุปการเช็คอินของพนักงานทั้งหมดในระบบ
            </Paragraph>
            <Divider />
            <Title level={5}>การใช้งาน:</Title>
            <ul>
              <li>
                <Text strong>Summary Cards:</Text> แสดงสถิติ 5 หมวด
                <ul>
                  <li>พนักงานทั้งหมด - จำนวนพนักงานทั้งหมดในระบบ</li>
                  <li>พนักงานที่เช็คอินวันนี้ - จำนวนพนักงานที่เช็คอินในวันนี้</li>
                  <li>มาสาย - จำนวนพนักงานที่มาสาย</li>
                  <li>หยุด - จำนวนพนักงานที่หยุดงาน</li>
                  <li>นอกพื้นที่ - จำนวนพนักงานที่เช็คอินนอกพื้นที่</li>
                </ul>
              </li>
              <li>
                <Text strong>กรองตามช่วงเวลา:</Text> เลือกดูข้อมูล "วันนี้", "7 วันล่าสุด", หรือ "เดือนนี้"
              </li>
              <li>
                <Text strong>กรองตามสาขา:</Text> คลิกที่ชื่อสาขาเพื่อกรองข้อมูลเฉพาะสาขานั้นๆ
              </li>
              <li>
                <Text strong>ตารางข้อมูล:</Text> แสดงรายละเอียดการเช็คอินของพนักงานแต่ละคน
              </li>
            </ul>
          </Card>
        </Panel>

        <Panel
          header={
            <Space>
              <UserOutlined style={iconStyle} />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>การจัดการพนักงาน</span>
            </Space>
          }
          key="2"
        >
          <Card type="inner" style={{ marginBottom: '16px' }}>
            <Title level={4}>👥 จัดการข้อมูลพนักงาน</Title>
            <Paragraph>
              หน้าจัดการพนักงานใช้สำหรับเพิ่ม แก้ไข และลบข้อมูลพนักงานในระบบ
            </Paragraph>
            <Divider />
            <Title level={5}>ฟีเจอร์หลัก:</Title>
            <ul>
              <li>
                <Text strong>เพิ่มพนักงานใหม่:</Text> กรอกข้อมูลพนักงาน เช่น รหัสพนักงาน, ชื่อ-นามสกุล, 
                เบอร์โทรศัพท์, แผนก, และสาขา
              </li>
              <li>
                <Text strong>แก้ไขข้อมูล:</Text> คลิกที่ปุ่มแก้ไขเพื่ออัปเดตข้อมูลพนักงาน
              </li>
              <li>
                <Text strong>ลบพนักงาน:</Text> คลิกที่ปุ่มลบเพื่อลบพนักงานออกจากระบบ
              </li>
              <li>
                <Text strong>ค้นหา:</Text> ใช้ช่องค้นหาเพื่อหาพนักงานตามชื่อหรือรหัสพนักงาน
              </li>
            </ul>
          </Card>
        </Panel>

        <Panel
          header={
            <Space>
              <ShopOutlined style={iconStyle} />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>การจัดการสาขา</span>
            </Space>
          }
          key="3"
        >
          <Card type="inner" style={{ marginBottom: '16px' }}>
            <Title level={4}>🏢 จัดการสาขา</Title>
            <Paragraph>
              หน้าจัดการสาขาใช้สำหรับเพิ่ม แก้ไข และลบข้อมูลสาขาในระบบ
            </Paragraph>
            <Divider />
            <Title level={5}>การใช้งาน:</Title>
            <ul>
              <li>
                <Text strong>เพิ่มสาขาใหม่:</Text> กรอกชื่อสาขาและบันทึก
              </li>
              <li>
                <Text strong>แก้ไขชื่อสาขา:</Text> คลิกที่ปุ่มแก้ไขเพื่อเปลี่ยนชื่อสาขา
              </li>
              <li>
                <Text strong>ลบสาขา:</Text> คลิกที่ปุ่มลบเพื่อลบสาขาออกจากระบบ
              </li>
            </ul>
            <Alert
              message="คำเตือน"
              description="การลบสาขาจะไม่สามารถกู้คืนได้ และอาจส่งผลกระทบต่อข้อมูลการเช็คอิน"
              type="warning"
              showIcon
              style={{ marginTop: '16px' }}
            />
          </Card>
        </Panel>

        <Panel
          header={
            <Space>
              <CheckCircleOutlined style={iconStyle} />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>การเช็คอิน</span>
            </Space>
          }
          key="4"
        >
          <Card type="inner" style={{ marginBottom: '16px' }}>
            <Title level={4}>✅ วิธีการเช็คอิน</Title>
            <Paragraph>
              พนักงานสามารถเช็คอินผ่าน LINE Application โดยใช้ LIFF
            </Paragraph>
            <Divider />
            <Title level={5}>ขั้นตอนการเช็คอิน:</Title>
            <ol>
              <li>เปิด LINE Application บนมือถือ</li>
              <li>สแกน QR Code หรือคลิกลิงก์ที่ได้รับ</li>
              <li>เลือกชื่อพนักงานของคุณ</li>
              <li>เลือกสาขาที่ต้องการเช็คอิน</li>
              <li>กดปุ่ม "เช็คอิน"</li>
              <li>ระบบจะแสดงผลการเช็คอินและสถานะ</li>
            </ol>
            <Divider />
            <Title level={5}>สถานะการเช็คอิน:</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Tag color="green">มาปกติ</Tag>
              <Text> - เช็คอินภายในเวลาที่กำหนด (8:00 - 8:05)</Text>
              <br />
              <Tag color="orange">มาสาย</Tag>
              <Text> - เช็คอินหลังจากเวลา 8:05 (มีค่าปรับ)</Text>
              <br />
              <Tag color="red">หยุด</Tag>
              <Text> - ไม่ได้เช็คอินในวันนั้น</Text>
              <br />
              <Tag color="purple">นอกพื้นที่</Tag>
              <Text> - เช็คอินนอกพื้นที่ที่กำหนด</Text>
            </Space>
            <Divider />
            <Title level={5}>ค่าปรับ:</Title>
            <ul>
              <li>มาสาย 8:06 - 8:15: <Text strong>20 บาท</Text></li>
              <li>มาสาย 8:16 - 8:30: <Text strong>50 บาท</Text></li>
              <li>มาสายหลัง 8:30: <Text strong>50 บาท</Text> (ถือว่าหยุด)</li>
            </ul>
          </Card>
        </Panel>

        <Panel
          header={
            <Space>
              <FileTextOutlined style={iconStyle} />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>รายงานสรุป</span>
            </Space>
          }
          key="5"
        >
          <Card type="inner" style={{ marginBottom: '16px' }}>
            <Title level={4}>📈 รายงานสรุปผล</Title>
            <Paragraph>
              หน้าสรุปผลรายงานแสดงข้อมูลสรุปการเช็คอินของพนักงานในช่วงเวลาที่เลือก
            </Paragraph>
            <Divider />
            <Title level={5}>ข้อมูลที่แสดง:</Title>
            <ul>
              <li>รหัสพนักงาน</li>
              <li>ชื่อพนักงาน</li>
              <li>สาขา</li>
              <li>จำนวนวันมาสาย</li>
              <li>ยอดหักรวม (ค่าปรับ)</li>
            </ul>
            <Divider />
            <Title level={5}>การใช้งาน:</Title>
            <ul>
              <li>เลือกช่วงวันที่ที่ต้องการดูรายงาน</li>
              <li>กดปุ่ม "ดึงข้อมูล" เพื่อโหลดข้อมูล</li>
              <li>สามารถ Export ข้อมูลเป็น Excel ได้</li>
            </ul>
          </Card>
        </Panel>

        <Panel
          header={
            <Space>
              <SettingOutlined style={iconStyle} />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>การตั้งค่าระบบ</span>
            </Space>
          }
          key="6"
        >
          <Card type="inner" style={{ marginBottom: '16px' }}>
            <Title level={4}>⚙️ ตั้งค่าระบบ</Title>
            <Paragraph>
              หน้าตั้งค่าใช้สำหรับกำหนดค่าต่างๆ ของระบบเช็คอิน
            </Paragraph>
            <Divider />
            <Title level={5}>การตั้งค่าเวลา:</Title>
            <ul>
              <li><Text strong>เวลาเริ่มงาน:</Text> กำหนดเวลาเริ่มงาน (เช่น 8:00)</li>
              <li><Text strong>กำหนดว่าสายหลังเวลา:</Text> กำหนดเวลาที่ถือว่าสาย (เช่น 8:05)</li>
              <li><Text strong>เวลาเลิกงาน:</Text> กำหนดเวลาเลิกงาน</li>
            </ul>
            <Divider />
            <Title level={5}>การตั้งค่าพิกัด:</Title>
            <ul>
              <li><Text strong>Latitude:</Text> ละติจูดของสถานที่เช็คอิน</li>
              <li><Text strong>Longitude:</Text> ลองจิจูดของสถานที่เช็คอิน</li>
              <li><Text strong>รัศมีอนุญาต:</Text> ระยะห่างที่อนุญาตให้เช็คอินได้ (เมตร)</li>
              <li><Text strong>อนุญาตให้นอกพื้นที่เช็คอิน:</Text> เปิด/ปิดการอนุญาตให้เช็คอินนอกพื้นที่</li>
            </ul>
            <Alert
              message="หมายเหตุ"
              description="การเปลี่ยนแปลงการตั้งค่าจะมีผลทันทีหลังจากบันทึก"
              type="info"
              showIcon
              style={{ marginTop: '16px' }}
            />
          </Card>
        </Panel>

        <Panel
          header={
            <Space>
              <QuestionCircleOutlined style={iconStyle} />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>คำถามที่พบบ่อย (FAQ)</span>
            </Space>
          }
          key="7"
        >
          <Card type="inner" style={{ marginBottom: '16px' }}>
            <Title level={4}>❓ คำถามที่พบบ่อย</Title>
            
            <Divider />
            <Title level={5}>Q: ถ้าลืมเช็คอินจะทำอย่างไร?</Title>
            <Paragraph>
              A: หากลืมเช็คอิน ระบบจะบันทึกสถานะเป็น "หยุด" อัตโนมัติ 
              และจะหักค่าปรับตามที่กำหนดไว้
            </Paragraph>

            <Divider />
            <Title level={5}>Q: สามารถแก้ไขข้อมูลการเช็คอินได้หรือไม่?</Title>
            <Paragraph>
              A: ข้อมูลการเช็คอินไม่สามารถแก้ไขได้โดยตรง เพื่อความถูกต้องของข้อมูล 
              หากมีปัญหา กรุณาติดต่อผู้ดูแลระบบ
            </Paragraph>

            <Divider />
            <Title level={5}>Q: ระบบคำนวณค่าปรับอย่างไร?</Title>
            <Paragraph>
              A: ระบบคำนวณค่าปรับตามเวลาที่เช็คอิน:
              <ul>
                <li>8:00 - 8:05: ไม่มีค่าปรับ</li>
                <li>8:06 - 8:15: ค่าปรับ 20 บาท</li>
                <li>8:16 - 8:30: ค่าปรับ 50 บาท</li>
                <li>หลัง 8:30: ค่าปรับ 50 บาท (ถือว่าหยุด)</li>
              </ul>
            </Paragraph>

            <Divider />
            <Title level={5}>Q: ต้องการดูประวัติการเช็คอินทำอย่างไร?</Title>
            <Paragraph>
              A: สามารถดูประวัติการเช็คอินได้ที่หน้า "History" ใน LINE Application 
              หรือดูรายงานสรุปได้ที่หน้า "สรุปผลรายงาน" ใน Dashboard
            </Paragraph>
          </Card>
        </Panel>

        <Panel
          header={
            <Space>
              <InfoCircleOutlined style={iconStyle} />
              <span style={{ fontSize: '16px', fontWeight: '600' }}>ข้อมูลติดต่อ</span>
            </Space>
          }
          key="8"
        >
          <Card type="inner" style={{ marginBottom: '16px' }}>
            <Title level={4}>📞 ติดต่อสอบถาม</Title>
            <Paragraph>
              หากมีคำถามหรือพบปัญหาการใช้งานระบบ กรุณาติดต่อ:
            </Paragraph>
            <Divider />
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Text strong>ฝ่าย IT Support</Text>
                <br />
                <Text type="secondary">Email: gamemodo6z@gmail.com</Text>
                <br />
                <Text type="secondary">โทร: 098-114-3300</Text>
                <br />
                <Text type="secondary">คุณ: จิรพงศ์ ศรีอำไพ</Text>
              </div>
             
            </Space>
            <Alert
              message="หมายเหตุ"
              description="กรุณาแจ้งปัญหาโดยละเอียด พร้อมภาพหน้าจอ (ถ้ามี) เพื่อให้ทีมงานสามารถช่วยเหลือได้อย่างรวดเร็ว"
              type="info"
              showIcon
              style={{ marginTop: '16px' }}
            />
          </Card>
        </Panel>
        <Panel
  header={
    <Space>
      <CalendarOutlined style={iconStyle} />
      <span style={{ fontSize: "16px", fontWeight: "600" }}>การจัดการวันลา</span>
    </Space>
  }
  key="9"
>
  <Card type="inner" style={{ marginBottom: "16px" }}>
    <Title level={4}>📅 การจัดการวันลา</Title>
    <Paragraph>
      หน้าจัดการวันลาใช้สำหรับเพิ่ม แก้ไข ลบ และตรวจสอบข้อมูลการลาของพนักงาน 
      พร้อมแสดงปฏิทินสรุปวันลาทั้งหมดในองค์กร
    </Paragraph>

    <Divider />

    <Title level={5}>ฟีเจอร์หลัก:</Title>
    <ul>
      <li>
        <Text strong>เพิ่มวันลา:</Text> เลือกชื่อพนักงาน ประเภทการลา และช่วงวันที่ต้องการลา
      </li>
      <li>
        <Text strong>แก้ไขวันลา:</Text> อัปเดตข้อมูลวันลาที่บันทึกไว้ เช่น เปลี่ยนวันที่ หรือประเภทวันลา
      </li>
      <li>
        <Text strong>ลบวันลา:</Text> ลบข้อมูลวันลาที่ไม่ต้องการ
      </li>
      <li>
        <Text strong>ปฏิทินวันลา:</Text> แสดงวันลาของพนักงานทั้งหมดด้วยสัญลักษณ์สี เช่น จุดสีแดง
      </li>
      <li>
        <Text strong>ค้นหาวันลา:</Text> ค้นหาจากชื่อพนักงาน หรือช่วงวันที่
      </li>
    </ul>

    <Divider />

    <Title level={5}>ประเภทการลา:</Title>
    <Space direction="vertical" style={{ width: "100%" }}>
      <Tag color="blue">ลาป่วย</Tag>
      <Text>ใช้เมื่อพนักงานมีอาการป่วย หรือมีใบรับรองแพทย์</Text>
      <br />

      <Tag color="green">ลาพักร้อน</Tag>
      <Text>สำหรับพนักงานใช้วันลาประจำปี</Text>
      <br />

      <Tag color="purple">ลากิจ</Tag>
      <Text>ลาเพื่อจัดการธุระส่วนตัว</Text>
      <br />

      <Tag color="orange">ลาคลอด</Tag>
      <Text>สำหรับพนักงานที่ลาคลอด</Text>
      <br />

      <Tag color="red">ลาขาด</Tag>
      <Text>ไม่ได้แจ้งลา หรือไม่ได้มาในวันทำงาน</Text>
    </Space>

    <Divider />

    <Title level={5}>คู่มือการใช้งาน:</Title>
    <ol>
      <li>คลิกปุ่ม “เพิ่มวันลา”</li>
      <li>เลือกประเภทวันลา และช่วงวันที่</li>
      <li>กดบันทึกเพื่อเพิ่มข้อมูลลงระบบ</li>
      <li>วันลาจะแสดงในปฏิทินด้วยจุดสี พร้อมชื่อพนักงาน</li>
      <li>สามารถกดที่รายการวันลาเพื่อแก้ไขหรือลบได้</li>
    </ol>

    <Alert
      message="หมายเหตุ"
      description="ข้อมูลวันลาที่ถูกบันทึกจะถูกนำไปแสดงบน Dashboard และปฏิทินอัตโนมัติ"
      type="info"
      showIcon
      style={{ marginTop: "16px" }}
    />
  </Card>
</Panel>
      </Collapse>


      <Card
        bordered={false}
        style={{
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white'
        }}
        bodyStyle={{ padding: '24px', textAlign: 'center' }}
      >
        <Title level={4} style={{ color: 'white', margin: 0 }}>
          ขอบคุณที่ใช้ระบบเช็คอินพนักงาน
        </Title>
        <Paragraph style={{ color: 'white', marginTop: '8px', marginBottom: 0 }}>
          หากมีคำถามเพิ่มเติม กรุณาติดต่อทีมงาน
        </Paragraph>
      </Card>
    </div>
  );
};

export default SystemManual;








