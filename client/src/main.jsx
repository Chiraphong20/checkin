import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';

// --- CSS ที่จำเป็น (สำคัญมาก) ---
import 'antd/dist/reset.css'; // 1. CSS หลักของ Antd (ต้องมาก่อน)
import './App.css';         // 3. CSS ที่เราเขียนเอง

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 4. หุ้ม App ด้วย BrowserRouter เพื่อเปิดใช้งานระบบ Routing */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
