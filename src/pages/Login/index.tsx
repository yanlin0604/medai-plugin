import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  FileTextOutlined,
  LockOutlined,
  LoginOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import { WindowTitleBar } from '../../components/Layout/AppLayout';
import LegalAgreementModal from '../../components/LegalAgreementModal';
import { loginWithPassword } from '../../services/authService';
import { useAuthStore } from '../../stores/useAuthStore';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const setToken = useAuthStore((state) => state.setToken);
  const setUserInfo = useAuthStore((state) => state.setUserInfo);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreementModal, setAgreementModal] = useState<'privacy' | 'service' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      navigate('/', { replace: true });
      return;
    }
    localStorage.removeItem('medaiPlugin.loginUsername');
  }, [navigate, token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUsername = username.trim();

    if (!nextUsername || !password) {
      message.warning('请输入账号和密码。');
      return;
    }

    if (!agreedToTerms) {
      message.warning('请先阅读并同意隐私协议和服务协议。');
      return;
    }

    setSubmitting(true);
    try {
      const result = await loginWithPassword({ username: nextUsername, password });
      setToken(result.token);
      setUserInfo(result.userInfo);

      if (rememberUsername) {
        localStorage.setItem('medaiPlugin.loginUsername', nextUsername);
      } else {
        localStorage.removeItem('medaiPlugin.loginUsername');
      }

      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      message.success('登录成功，欢迎回来。');
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F4F7FB] font-sans text-slate-800">
      <WindowTitleBar
        titleOverride="账号密码登录"
        subtitleOverride="AI 病历书写助手 · 安全访问"
      />

      <main className="custom-scrollbar flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-6">
        <section className="w-full max-w-[420px]">
          <div className="mb-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1E3A8A] text-white shadow-lg shadow-blue-900/15">
              <FileTextOutlined className="text-2xl" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">AI 病历书写助手</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">登录后进入专属病历工作台</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(30,58,138,0.09)]">
            {/* <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/70 px-3.5 py-3">
              <MedicineBoxOutlined className="mt-0.5 shrink-0 text-lg text-[#1E3A8A]" />
              <div>
                <p className="text-xs font-bold text-[#1E3A8A]">医生账号登录</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  登录后将根据账号权限展示病历书写、查房记录等功能。
                </p>
              </div>
            </div> */}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">账号</span>
                <span className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 transition-colors focus-within:border-[#1E3A8A] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                  <UserOutlined className="text-slate-400" />
                  <input
                    autoComplete="username"
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    placeholder="请输入工号或账号"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">密码</span>
                <span className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 transition-colors focus-within:border-[#1E3A8A] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                  <LockOutlined className="text-slate-400" />
                  <input
                    autoComplete="current-password"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    placeholder="请输入登录密码"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                    onClick={() => setShowPassword((visible) => !visible)}
                    title={showPassword ? '隐藏密码' : '显示密码'}
                    type="button"
                  >
                    {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-500">
                <input
                  checked={rememberUsername}
                  className="h-3.5 w-3.5 accent-[#1E3A8A]"
                  onChange={(event) => setRememberUsername(event.target.checked)}
                  type="checkbox"
                />
                记住账号（仅保存在本机）
              </label>

              <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-5 text-slate-500">
                <input
                  checked={agreedToTerms}
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-[#1E3A8A]"
                  onChange={(event) => setAgreedToTerms(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  我已阅读并同意
                  <button
                    className="mx-0.5 font-bold text-[#1E3A8A] hover:text-[#172554]"
                    onClick={(event) => {
                      event.preventDefault();
                      setAgreementModal('privacy');
                    }}
                    type="button"
                  >
                    《隐私协议》
                  </button>
                  和
                  <button
                    className="mx-0.5 font-bold text-[#1E3A8A] hover:text-[#172554]"
                    onClick={(event) => {
                      event.preventDefault();
                      setAgreementModal('service');
                    }}
                    type="button"
                  >
                    《服务协议》
                  </button>
                </span>
              </label>

              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1E3A8A] text-sm font-bold text-white shadow-md shadow-blue-900/15 transition-colors hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting}
                type="submit"
              >
                {submitting ? '登录中…' : '登录'}
                {!submitting && <LoginOutlined />}
              </button>
            </form>
          </div>

          {agreementModal && (
            <LegalAgreementModal kind={agreementModal} onClose={() => setAgreementModal(null)} />
          )}

          <p className="mt-4 text-center text-[10px] leading-5 text-slate-400">
            登录即表示你已在医院信息系统中完成身份认证
          </p>
        </section>
      </main>
    </div>
  );
}
