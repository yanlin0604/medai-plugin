import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightOutlined,
  CheckOutlined,
  FileProtectOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import LegalAgreementModal, { type AgreementKind } from '../../components/LegalAgreementModal';
import { changePassword } from '../../services/authService';
import { checkForApplicationUpdate } from '../../services/updateService';
import { useAuthStore } from '../../stores/useAuthStore';

export default function Profile() {
  const navigate = useNavigate();
  const userInfo = useAuthStore((state) => state.userInfo);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [agreementKind, setAgreementKind] = useState<AgreementKind | null>(null);

  if (!userInfo) return null;

  const displayName = userInfo.userName || '未设置姓名';

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      message.warning('请完整填写密码信息。');
      return;
    }
    if (newPassword.length < 6) {
      message.warning('新密码长度不能少于 6 位。');
      return;
    }
    if (newPassword !== confirmPassword) {
      message.warning('两次输入的新密码不一致。');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword({ oldPassword, newPassword });
      message.success('密码修改成功，请使用新密码登录。');
      setPasswordModalOpen(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '密码修改失败，请稍后重试。');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const result = await checkForApplicationUpdate();
      if (result.available && result.latestVersion) {
        message.info(`发现新版本 ${result.latestVersion}，请联系管理员完成升级。`);
        return;
      }
      message.success(`当前已是最新版本（${result.currentVersion}）。`);
    } catch (error) {
      message.warning(error instanceof Error ? error.message : '检查更新失败，请稍后重试。');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F6F8FB]">
      <div className="mx-auto w-full max-w-3xl px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">个人中心</h1>
            <p className="mt-1 text-xs text-slate-500">管理你的个人资料和账号安全</p>
          </div>
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
            onClick={() => navigate('/', { replace: true })}
            type="button"
          >
            返回
          </button>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-blue-50 bg-[#EAF1FF] text-2xl font-bold text-[#1E3A8A]">
                {userInfo.avatar ? (
                  <img alt="医生头像" className="h-full w-full object-cover" src={userInfo.avatar} />
                ) : (
                  displayName.slice(0, 1) || <UserOutlined />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-slate-900">{displayName}</h2>
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  {userInfo.deptName || '未设置科室'}
                  <span className="mx-1 text-slate-300">·</span>
                  {userInfo.title || '未设置职称'}
                </p>
                <p className="mt-1 truncate text-[10px] text-slate-400">账号 {userInfo.userId}</p>
              </div>
            </div>
            <button
              aria-label="编辑资料"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
              onClick={() => navigate('/profile/edit')}
              title="编辑资料"
              type="button"
            >
              编辑资料
              <ArrowRightOutlined />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4">
            <CompactInfo label="姓名" value={userInfo.userName || '未设置'} />
            <CompactInfo label="科室" value={userInfo.deptName || '未设置'} />
            <CompactInfo label="职称" value={userInfo.title || '未设置'} />
            <CompactInfo label="账号角色" value={userInfo.roles.join('、') || '医生'} />
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <SafetyCertificateOutlined />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">账号安全</h2>
                <p className="mt-1 text-[11px] text-slate-400">定期修改密码，保护账号和医疗数据安全</p>
              </div>
            </div>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
              onClick={() => setPasswordModalOpen(true)}
              type="button"
            >
              <LockOutlined />
              修改密码
            </button>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">其他设置</h2>
            <p className="mt-1 text-[11px] text-slate-400">应用版本与协议说明</p>
          </div>
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            <button
              className="flex w-full items-center justify-between py-3 text-left hover:bg-slate-50"
              disabled={checkingUpdate}
              onClick={() => void handleCheckUpdate()}
              type="button"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                  <SyncOutlined className={checkingUpdate ? 'animate-spin' : ''} />
                </span>
                <span>
                  <span className="block text-xs font-bold text-slate-700">检查更新</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {checkingUpdate ? '正在检查最新版本' : '检查当前应用是否有新版本'}
                  </span>
                </span>
              </span>
              <ArrowRightOutlined className="text-xs text-slate-400" />
            </button>
            <button
              className="flex w-full items-center justify-between py-3 text-left hover:bg-slate-50"
              onClick={() => setAgreementKind('privacy')}
              type="button"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <FileProtectOutlined />
                </span>
                <span>
                  <span className="block text-xs font-bold text-slate-700">隐私协议</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">查看个人信息处理与保护说明</span>
                </span>
              </span>
              <ArrowRightOutlined className="text-xs text-slate-400" />
            </button>
            <button
              className="flex w-full items-center justify-between py-3 text-left hover:bg-slate-50"
              onClick={() => setAgreementKind('service')}
              type="button"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <SafetyCertificateOutlined />
                </span>
                <span>
                  <span className="block text-xs font-bold text-slate-700">服务协议</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">查看系统使用规范与服务说明</span>
                </span>
              </span>
              <ArrowRightOutlined className="text-xs text-slate-400" />
            </button>
          </div>
        </section>
      </div>

      {agreementKind && (
        <LegalAgreementModal
          kind={agreementKind}
          onClose={() => setAgreementKind(null)}
        />
      )}

      {passwordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-5"
          onClick={() => setPasswordModalOpen(false)}
          role="presentation"
        >
          <form
            className="w-full max-w-[400px] rounded-xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleChangePassword}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">修改密码</h2>
                <p className="mt-1 text-[11px] text-slate-400">新密码至少 6 位字符</p>
              </div>
              <button
                aria-label="关闭修改密码"
                className="flex h-7 w-7 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-100"
                onClick={() => setPasswordModalOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="space-y-3.5">
              <PasswordField label="原密码" value={oldPassword} onChange={setOldPassword} />
              <PasswordField label="新密码" value={newPassword} onChange={setNewPassword} />
              <PasswordField label="确认新密码" value={confirmPassword} onChange={setConfirmPassword} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => setPasswordModalOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A8A] px-4 py-2 text-xs font-bold text-white hover:bg-[#172554] disabled:opacity-60"
                disabled={changingPassword}
                type="submit"
              >
                <CheckOutlined />
                {changingPassword ? '提交中' : '确认修改'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[10px] font-medium text-slate-400">{label}</span>
      <span className="mt-1 block truncate text-xs font-bold text-slate-700">{value}</span>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span>
      <span className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 focus-within:border-[#1E3A8A] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
        <LockOutlined className="text-slate-400" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          onChange={(event) => onChange(event.target.value)}
          type="password"
          value={value}
        />
      </span>
    </label>
  );
}
