import React, { useState, useEffect } from "react";
import { Layout, Menu, Dropdown, Avatar, theme, ConfigProvider, Drawer, Button } from "antd";
import {
  ShopOutlined,
  SettingOutlined,
  LogoutOutlined,
  BookOutlined,
  LineChartOutlined,
  CalendarOutlined,
  PieChartOutlined,
  UserOutlined,
  ScheduleOutlined,
  MenuOutlined // ✅ เพิ่มไอคอนเมนู
} from "@ant-design/icons";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import dayjs from "dayjs";

// ✅ นำเข้าไฟล์ CSS
import "./AppLayout.css";

const { Header, Content, Sider } = Layout;

const AppLayout = ({ username, onLogout, userPictureUrl }) => {
  const [currentTime, setCurrentTime] = useState(dayjs());
  const [pictureUrl, setPictureUrl] = useState(userPictureUrl);
  
  // ✅ State สำหรับเปิด/ปิด เมนูในมือถือ
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const {
    token: { colorBgContainer },
  } = theme.useToken();

  // Load Picture Logic (เหมือนเดิม)
  useEffect(() => {
    const loadPictureUrl = () => {
      try {
        const adminUser = localStorage.getItem("admin_user");
        if (adminUser) {
          const user = JSON.parse(adminUser);
          if (user.pictureUrl) {
            setPictureUrl(user.pictureUrl);
          }
        }
      } catch (err) {
        console.error("Error loading picture URL:", err);
      }
    };
    loadPictureUrl();
    window.addEventListener('adminDataUpdated', loadPictureUrl);
    return () => {
      window.removeEventListener('adminDataUpdated', loadPictureUrl);
    };
  }, []);

  // Clock Logic (เหมือนเดิม)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === "/" || path === "/dashboard") return "/dashboard";
    if (path === "/dashboard/adprofile") return "adprofile";
    const parts = path.split("/");
    if (parts[1] === "dashboard" && parts[2]) {
      return parts[2];
    }
    return path;
  };

  const currentKey = getSelectedKey();

  const mainMenuItems = [
    { key: "/dashboard", icon: <PieChartOutlined />, label: "ภาพรวมระบบ" },
    { key: "employees", icon: <UserOutlined />, label: "จัดการพนักงาน" },
    { key: "branches", icon: <ShopOutlined />, label: "จัดการสาขา" },
    { key: "leave", icon: <CalendarOutlined />, label: "ปฏิทินวันลา & วันหยุด" },
    { key: "reports", icon: <LineChartOutlined />, label: "สรุปผลรายงาน" },
    { key: "adcheckin", icon: <ScheduleOutlined />, label: "เช็คอินพนักงาน" },
  ];

  const helpMenuItems = [
    { key: "settings", icon: <SettingOutlined />, label: "การตั้งค่า" },
    { key: "manual", icon: <BookOutlined />, label: "คู่มือระบบ" },
    { key: "logout", icon: <LogoutOutlined />, label: "ออกจากระบบ", danger: true },
  ];

  const sidebarItems = [
    ...mainMenuItems,
    {
      type: 'group',
      label: 'ศูนย์ช่วยเหลือ',
      children: helpMenuItems
    }
  ];

  const getPageTitle = () => {
    if (location.pathname === "/dashboard/adprofile") return "ข้อมูลส่วนตัวผู้ดูแล";
    const allMenus = [...mainMenuItems, ...helpMenuItems];
    const found = allMenus.find((item) => item.key === currentKey);
    return found ? found.label : "";
  };

  const onMenuClick = ({ key }) => {
    // ✅ เมื่อกดเมนูในมือถือ ให้ปิด Drawer ด้วย
    setMobileOpen(false);

    if (key === "/dashboard") {
      navigate("/dashboard");
    } else if (key === "logout") {
      onLogout();
    } else {
      navigate(`/dashboard/${key}`);
    }
  };

  const userDropdownItems = [
    { key: "adprofile", icon: <UserOutlined />, label: "โปรไฟล์" },
    { key: "logout", icon: <LogoutOutlined />, label: "ออกจากระบบ", danger: true },
  ];

  const onUserMenuClick = ({ key }) => {
    if (key === "adprofile") {
      navigate("/dashboard/adprofile");
    } else if (key === "logout") {
      onLogout();
    }
  };

  // ✅ Component โลโก้ (ใช้ซ้ำได้ทั้ง Desktop และ Mobile)
  const LogoComponent = ({ isMobile = false }) => (
    <div className={isMobile ? "drawer-logo" : "logo-container"}>
      <img
        src="/logo.png"
        alt="Logo"
        style={{
          width: "54px",
          height: "54px",
          borderRadius: "50%",
          background: "#ff6b35",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          objectFit: "cover",
          marginRight: "1px",
        }}
      />
      <span style={{ fontSize: "20px", fontWeight: "700", marginLeft: "10px" }}>
        วงษ์หิรัญ
      </span>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#ff6b35",
        },
      }}
    >
      <Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
        
        {/* ✅ 1. Sider สำหรับ Desktop (ซ่อนเมื่อจอเล็กผ่าน CSS class) */}
        <Sider
          width={250}
          className="desktop-sider" 
          style={{
            background: "#fff",
            boxShadow: "2px 0 8px rgba(0,0,0,0.1)",
            position: 'fixed', // Fix sidebar
            height: '100vh',
            left: 0,
            top: 0,
            zIndex: 100
          }}
        >
          <LogoComponent />
          <Menu
            mode="inline"
            selectedKeys={[currentKey]}
            onClick={onMenuClick}
            style={{ borderRight: "none", paddingTop: "16px" }}
            items={sidebarItems}
          />
        </Sider>

        {/* ✅ 2. Drawer สำหรับ Mobile (แสดงเมื่อกดปุ่ม Hamburger) */}
        <Drawer
          placement="left"
          onClose={() => setMobileOpen(false)}
          open={mobileOpen}
          width={250}
          styles={{ body: { padding: 0 } }} // Reset padding
        >
          <LogoComponent isMobile={true} />
          <Menu
            mode="inline"
            selectedKeys={[currentKey]}
            onClick={onMenuClick}
            style={{ borderRight: "none" }}
            items={sidebarItems}
          />
        </Drawer>

        {/* Layout ฝั่งขวา (Content) */}
        <Layout className="site-layout" style={{ marginLeft: window.innerWidth > 768 ? 250 : 0, transition: 'all 0.2s' }}>
          <Header
            className="site-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0 24px",
              background: "#ffffff",
              borderBottom: "1px solid #f0f0f0",
              height: "70px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              position: 'sticky',
              top: 0,
              zIndex: 99,
              width: '100%'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {/* ✅ ปุ่ม Hamburger (แสดงเฉพาะ Mobile ผ่าน CSS) */}
              <div className="mobile-menu-trigger" onClick={() => setMobileOpen(true)}>
                 <MenuOutlined />
              </div>
              
              <div className="page-title" style={{ fontSize: "20px", fontWeight: "600" }}>
                {getPageTitle()}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              {/* ✅ นาฬิกา (ซ่อนใน Mobile ผ่าน CSS) */}
              <div className="header-clock" style={{ fontSize: "12px", color: "#8c8c8c" }}>
                {currentTime.format("DD/MM/YYYY HH:mm:ss")}
              </div>

              <Dropdown
                menu={{
                  items: userDropdownItems,
                  onClick: onUserMenuClick
                }}
                placement="bottomRight"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: "8px",
                  }}
                >
                  <Avatar
                    src={pictureUrl}
                    size={40}
                    style={{ background: "#1890ff" }}
                  >
                    {username?.charAt(0)?.toUpperCase()}
                  </Avatar>

                  {/* ซ่อนชื่อ User ในมือถือถ้ายาวไป หรือจะโชว์ก็ได้ */}
                  <span style={{ fontSize: "14px", fontWeight: "500", display: 'block' }}>
                    {username || "Admin"}
                  </span>
                </div>
              </Dropdown>
            </div>
          </Header>

          <Content
            style={{
              margin: 0,
              padding: "20px",
              background: "#f5f5f5",
              minHeight: "calc(100vh - 70px)",
              overflow: 'initial'
            }}
          >
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default AppLayout;