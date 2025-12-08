import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import liff from '@line/liff';
import './CSS/AppResponsive.css';
import './CSS/MobileTable.css';   // ✅ ใส่บรรทัดนี้เพิ่มครับ!
// Admin Login Page
import Login from './pages/Login'; 

// Layout + Pages (Web Admin)
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import ManageEmployees from './pages/ManageEmployees';
import ManageBranches from './pages/ManageBranches';
import PayrollReport from './pages/PayrollReport';
import Settings from './pages/SettingsPage';
import SystemManual from './pages/SystemManual';
import EmployeeLeaveDashboard from "./pages/EmployeeLeaveDashboard";
import AdminProfile from "./pages/AdminProfile"; 
import AdminManualCheckIn from "./pages/AdminManualCheckIn"; 


// LIFF Pages (Line Mobile)
import EmployeeCheckIn from './pages/EmployeeCheckIn';
import ProfileEmployee from './pages/ProfileEmployee';
import LeaveBalance from './pages/LeaveBalance';
import History from './pages/History';
import LateHistory from './pages/LateHistory';

function App() {
  // 👥 สถานะสำหรับ LIFF User (พนักงาน)
  const [liffUser, setLiffUser] = useState(null);
  const [liffReady, setLiffReady] = useState(false);
  
  // 🔑 สถานะสำหรับ Admin User (ผู้ดูแลระบบ)
  const [adminUser, setAdminUser] = useState(null); 
  
  // 💡 เช็คว่าเปิดใน LINE หรือไม่
  const isLiffMode = liffReady && liff.isInClient(); 

  // --- 1. ตรวจสอบ LocalStorage ---
  useEffect(() => {
    const storedUser = localStorage.getItem('admin_user');
    if (storedUser) {
        try {
            setAdminUser(JSON.parse(storedUser));
        } catch (error) {
            localStorage.removeItem('admin_user');
        }
    }
  }, []);

  // --- 2. เริ่มต้นระบบ LIFF ---
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: '2008408737-4x2nLQp8' });
        setLiffReady(true);

        if (liff.isInClient() && !liff.isLoggedIn()) {
             liff.login();
             return; 
        }

        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            setLiffUser({
              name: profile.displayName,
              userId: profile.userId,
              pictureUrl: profile.pictureUrl,
            });
        }
      } catch (err) {
        console.error('❌ LIFF init error:', err);
        setLiffReady(true); 
      }
    };

    initLiff();
  }, []);

  // --- 3. Handlers ---
  const handleAdminLogin = (user) => {
    setAdminUser(user);
    localStorage.setItem('admin_user', JSON.stringify(user));
    // ไม่ต้อง navigate ที่นี่ ปล่อยให้ Route ด้านล่างจัดการ
  };
  
  const handleAdminLogout = () => {
    setAdminUser(null);
    localStorage.removeItem('admin_user');
  };

  // --- 4. Loading State ---
  if (!liffReady) {
      return <div style={{ textAlign: 'center', marginTop: '50px' }}>⏳ กำลังโหลดระบบ...</div>;
  }

  // --- 5. Routing Logic ---

  // 🅰️ กรณีเปิดใน LINE Client (มือถือ)
  if (isLiffMode) {
      if (!liffUser) {
          return <div style={{ textAlign: 'center', marginTop: '50px' }}>⏳ กำลังยืนยันตัวตน...</div>;
      }
      return (
        <Routes>
          <Route path="/checkin" element={<EmployeeCheckIn user={liffUser} />} />
          <Route path="/profile" element={<ProfileEmployee user={liffUser} />} />
          <Route path="/leavebalance" element={<LeaveBalance user={liffUser} />} />
          <Route path="/history" element={<History user={liffUser} />} />
          <Route path="/latehistory/:employeeId" element={<LateHistory />} />
          <Route path="*" element={<Navigate to="/checkin" replace />} />
        </Routes>
      );
  }

  // 🅱️ กรณีเปิดใน Web Browser (Admin Mode)
  const ProtectedRoute = ({ children }) => {
    if (!adminUser) {
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  return (
    <Routes>
      {/* ✅ แก้ไข: ถ้าล็อกอินแล้ว ให้เด้งไป Dashboard ทันที (Auto Redirect) */}
      <Route 
        path="/login" 
        element={
          adminUser ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleAdminLogin} />
        } 
      />
      
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout 
                username={adminUser?.name || 'Admin'} 
                onLogout={handleAdminLogout} 
                userPictureUrl={null} 
            />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<ManageEmployees />} />
        <Route path="branches" element={<ManageBranches />} />
        <Route path="reports" element={<PayrollReport />} />
        <Route path="settings" element={<Settings />} />
        <Route path="manual" element={<SystemManual />} />
        <Route path="leave" element={<EmployeeLeaveDashboard />} />
        <Route path="adprofile" element={<AdminProfile />} />
        <Route path="adcheckin" element={<AdminManualCheckIn />} />


      </Route>

      <Route
        path="*"
        element={
           adminUser ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
        }
      />
    </Routes>
  );
}

export default App;