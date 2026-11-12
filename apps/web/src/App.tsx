import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SettingsProvider } from "./lib/settings.tsx";
import { Icon } from "./components/Icon.tsx";
import { ToastHost, toast } from "./components/Toast.tsx";
import Home from "./pages/Home.tsx";
import Library from "./pages/Library.tsx";
import Exam from "./pages/Exam.tsx";
import Result from "./pages/Result.tsx";
import Wrong from "./pages/Wrong.tsx";
import Vocab from "./pages/Vocab.tsx";
import Settings from "./pages/Settings.tsx";

const NAV = [
  { to: "/", label: "首页", icon: "home" as const },
  { to: "/library", label: "试卷库", icon: "library" as const },
  { to: "/wrong", label: "错题本", icon: "wrong" as const },
  { to: "/vocab", label: "生词本", icon: "vocab" as const },
  { to: "/settings", label: "设置", icon: "settings" as const },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CET NOVA</span>
        </div>
        <div className="brand-sub" style={{ padding: "0 8px", marginTop: -20 }}>
          六级智能备考
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <span className="nav-icon">
                <Icon name={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          离线优先 · 无需登录
          <br />
          V0.1 演示版
        </div>
      </aside>

      <main className="main">{children}</main>

      <nav className="mobile-nav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span className="nav-icon">
              <Icon name={item.icon} size={20} />
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const fullScreen =
    location.pathname.startsWith("/exam/") || location.pathname.startsWith("/result/");

  useEffect(() => {
    const offline = () => toast("已离线：记录仍会保存在本机");
    const online = () => toast("网络已恢复");
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  return (
    <SettingsProvider>
      {fullScreen ? (
        <Routes>
          <Route path="/exam/:attemptId" element={<Exam />} />
          <Route path="/result/:attemptId" element={<Result />} />
        </Routes>
      ) : (
        <Shell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/library" element={<Library />} />
            <Route path="/wrong" element={<Wrong />} />
            <Route path="/vocab" element={<Vocab />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Shell>
      )}
      <ToastHost />
    </SettingsProvider>
  );
}
