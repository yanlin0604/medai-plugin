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
  const [rememberUsername, setRememberUsername] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreementModal, setAgreementModal] = useState<'privacy' | 'service' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      navigate('/', { replace: true });
      return;
    }

    const savedUsername = localStorage.getItem('medaiPlugin.loginUsername');
    if (savedUsername) setUsername(savedUsername);
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
{/* 
            {import.meta.env.DEV && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-[10px] text-slate-400">
                <SafetyCertificateOutlined className="text-slate-400" />
                <span>开发演示账号：demo / demo123</span>
              </div>
            )} */}
          </div>

          {agreementModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-5"
              onClick={() => setAgreementModal(null)}
              role="presentation"
            >
              <section
                aria-labelledby="agreement-title"
                aria-modal="true"
                className="max-h-[76vh] w-full max-w-[440px] overflow-hidden rounded-xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h2 id="agreement-title" className="text-sm font-bold text-slate-900">
                    {agreementModal === 'privacy' ? '隐私协议' : '服务协议'}
                  </h2>
                  <button
                    aria-label="关闭协议"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => setAgreementModal(null)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <div className="custom-scrollbar max-h-[58vh] overflow-y-auto px-5 py-4 text-xs leading-6 text-slate-600">
                  {agreementModal === 'privacy' ? (
                    <>
                      <p className="font-bold text-slate-800">一、信息收集</p>
                      <p>为完成账号登录、权限校验和病历书写服务，系统可能处理账号、姓名、科室、角色以及业务操作记录等必要信息。</p>
                      <p className="mt-3 font-bold text-slate-800">二、信息使用</p>
                      <p>相关信息仅用于身份认证、功能授权、系统运行和安全审计，不会超出医疗业务场景使用。</p>
                      <p className="mt-3 font-bold text-slate-800">三、信息保护</p>
                      <p>系统将按照医院信息安全管理要求采取访问控制、传输保护和日志审计等措施。涉及患者的信息应仅用于授权的诊疗工作。</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-slate-800">一、服务内容</p>
                      <p>本系统为医疗人员提供病历书写辅助、查房记录整理及相关工作流支持，具体功能以当前版本为准。</p>
                      <p className="mt-3 font-bold text-slate-800">二、使用规范</p>
                      <p>用户应使用本人账号登录，妥善保管账号密码，并在授权范围内使用系统，不得擅自共享账号或越权访问医疗信息。</p>
                      <p className="mt-3 font-bold text-slate-800">三、责任说明</p>
                      <p>系统生成内容仅作为书写辅助，不能替代医生的专业判断。提交或回写病历前，用户应完成必要的核对、修改和确认。</p>
                    </>
                  )}
                </div>
                <div className="border-t border-slate-100 px-5 py-3 text-right">
                  <button
                    className="rounded-md bg-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:bg-[#172554]"
                    onClick={() => setAgreementModal(null)}
                    type="button"
                  >
                    我知道了
                  </button>
                </div>
              </section>
            </div>
          )}

          <p className="mt-4 text-center text-[10px] leading-5 text-slate-400">
            登录即表示你已在医院信息系统中完成身份认证
          </p>
        </section>
      </main>
    </div>
  );
}
